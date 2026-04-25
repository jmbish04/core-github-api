import type { GuardrailAgent } from "../index";
import type { EvaluationPayload, VerdictIssue, CorrectionPrompt } from "../types";
import { listGoldenPathConfigs } from "@/services/golden-path-config";
import { Logger } from "@/lib/logger";

import { z } from "zod";

interface GoldenPathResult {
  issues: VerdictIssue[];
  corrections: CorrectionPrompt[];
}

/**
 * Lock L4 — Cloudflare-docs golden-path enforcement (Agentic).
 *
 * This is the agentic evaluation pipeline:
 *   1. Load active golden path rules from D1 (self-service, frontend-configurable)
 *   2. Run static pattern matching for rules that have `pattern` defined
 *   3. Delegate to CloudflareAgent.agenticSearch() for Cloudflare docs context
 *   4. Use AIProvider to evaluate code against docs context + rules
 *
 * Rules are managed via the frontend Settings → Golden Path Config UI.
 * New rules go live immediately — no code deploy required.
 */
export async function fetchCloudflareGoldenPath(
  agent: GuardrailAgent,
  payload: EvaluationPayload,
): Promise<GoldenPathResult> {
  const issues: VerdictIssue[] = [];
  const corrections: CorrectionPrompt[] = [];
  const env = agent.getEnv();
  const logger = new Logger(env, "GuardrailAgent:cloudflare-docs");
  const loggerPrefix = "[GuardrailAgent:cloudflare-docs] ";
  // ── Step 1: Load active golden path rules from D1 ──────────────────
  const allConfigs = await listGoldenPathConfigs(env);
  const activeRules = allConfigs.filter((c) => (c as any).isActive !== false);

  if (activeRules.length === 0) {
    logger.info(`${loggerPrefix}No active golden path rules found`);
    return { issues, corrections };
  }

  // ── Step 2: Static pattern matching (instant, no AI needed) ────────
  for (const file of payload.files) {
    for (const config of activeRules) {
      const raw = config as any;
      const pattern = raw.pattern as string | null;
      if (!pattern) continue;

      const patternType = (raw.patternType as string) || "string";
      let matched = false;

      if (patternType === "regex") {
        try {
          const regex = new RegExp(pattern);
          matched = regex.test(file.content);
        } catch (err) {
          // Invalid regex — skip silently, admin can fix in the UI
          logger.error(`${loggerPrefix}Invalid regex pattern: ${pattern}`, err);
        }
      } else {
        // Default: string includes check
        matched = file.content.includes(pattern);
        logger.info(`${loggerPrefix}Static pattern match: ${pattern}`);
      }

      if (matched) {
        const issue: VerdictIssue = {
          severity: (raw.severity as VerdictIssue["severity"]) || "warning",
          rule: `gp:${config.scope.title}/${config.title}`,
          file: file.path,
          message: config.description,
          docsUrl: raw.docsUrl || undefined,
        };
        logger.info(`${loggerPrefix}Static pattern match: ${issue}`);
        issues.push(issue);
      }
    }
  }

  // ── Step 3: Agentic MCP documentation lookup ───────────────────────
  // Delegate to CloudflareAgent.agenticSearch() — CloudflareAgent handles
  // query rewriting internally (rewriteQuestionForMCP). Do NOT rewrite locally.
  const fileSummary = payload.files
    .map((f) => `${f.path} (${f.language || "unknown"}, ${f.content.length} chars)`)
    .join(", ");

  const rulesSummary = activeRules
    .map((r) => `${r.scope.title}: ${r.rule}`)
    .join("\n");

  const mcpQuestionBase = `I need to verify that the following code files comply with our Cloudflare golden-path rules.
     Files: ${fileSummary}
     Rules to check: ${rulesSummary}
     What are the latest Cloudflare best practices and documentation for these areas?
  `;

  logger.info(`${loggerPrefix}MCP question base: ${mcpQuestionBase}`);

  let docsContext: string | null = null;
  try {
    const cloudflareAgent = (agent as any).getPeerAgent((env as any).CLOUDFLARE_AGENT);
    const mcpResult = await cloudflareAgent.agenticSearch(
      mcpQuestionBase,
      { files: payload.files.map((f) => f.path), rules: activeRules.map((r) => r.title) },
    );
    docsContext = mcpResult?.docsContext ?? null;
  } catch (err) {
    logger.error(`${loggerPrefix}MCP query failed via CloudflareAgent:`, err);
    // Graceful degradation — static checks still ran above
  }

  // ── Step 4: AI-powered deep evaluation ─────────────────────────────
  // Only run the expensive AI check if we have docs context or complex files
  if (docsContext && payload.files.length > 0) {
    const codeSnippets = payload.files
      .slice(0, 5) // Limit to avoid token overflow
      .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 3000)}`)
      .join("\n\n");

    const evaluationPrompt = `You are a Cloudflare Workers expert code reviewer.

GOLDEN PATH RULES (from the team's live configuration):
${rulesSummary}

CLOUDFLARE DOCUMENTATION CONTEXT (latest from MCP):
${docsContext.slice(0, 5000)}

CODE TO EVALUATE:
${codeSnippets}

Analyze the code against the golden path rules and the latest Cloudflare documentation.`;

    const schema = z.array(z.object({
      severity: z.union([z.literal("warning"), z.literal("error"), z.literal("critical")]).optional(),
      rule: z.string(),
      file: z.string(),
      message: z.string(),
      docsUrl: z.string().optional()
    }));

    try {
      const aiIssues = await agent.getAI().generateStructuredResponse(
        evaluationPrompt,
        schema,
        "You are a strict Cloudflare platform compliance reviewer.",
        { skills: agent.getSkills() }
      );

      // Deduplicate — AI might re-flag things static checks already caught
      const existingKeys = new Set(issues.map((i) => `${i.rule}:${i.file}`));
      for (const aiIssue of aiIssues) {
        const key = `${aiIssue.rule}:${aiIssue.file}`;
        if (!existingKeys.has(key)) {
          issues.push({
            severity: aiIssue.severity as any || "warning",
            rule: aiIssue.rule,
            file: aiIssue.file,
            message: aiIssue.message,
            docsUrl: aiIssue.docsUrl,
          });
          existingKeys.add(key);
        }
      }
    } catch (err) {
      logger.error(`${loggerPrefix}AI evaluation failed:`, err);
      // Static checks are still valid
    }
  }

  // ── Step 5: Cache the Cloudflare docs context in DO SQLite ─────────
  if (docsContext) {
    try {
      (agent as any).ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO guardrail_rule_cache (rule_key, content, cached_at)
         VALUES (?, ?, ?)`,
        `mcp:${payload.requestId}`,
        docsContext.slice(0, 10000),
        Date.now(),
      );
    } catch (err) {
      logger.error(`${loggerPrefix}Failed to cache Cloudflare docs context:`, err);
    }
  }

  logger.info(`${loggerPrefix}Cloudflare golden path evaluation completed. 
    Issues: ${JSON.stringify(issues)}; 
    Corrections: ${JSON.stringify(corrections)}
  `);

  return { issues, corrections };
}
