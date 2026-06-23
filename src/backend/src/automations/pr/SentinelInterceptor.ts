/**
 * @file backend/src/automations/pr/SentinelInterceptor.ts
 * @description Active PR Interceptor — analyzes PRs against architectural memory
 * and posts findings as comments using the human persona token.
 *
 * Triggers on pull_request opened/synchronize events.
 * Uses GITHUB_PERSONAL_ACCESS_TOKEN so comments appear from a human account
 * and aren't ignored by bot filters.
 *
 * @module Automations/PR/SentinelInterceptor
 */

import { z } from "zod";
import {
  BaseAutomation,
  type AutomationMetadata,
} from "@/automations/core/BaseAutomation";
import { getDb } from "@db";
import { learningAiInsights } from "@db/schemas/github/learning";
import { eq, and } from "drizzle-orm";
import { Logger } from "@/lib/logger";

const SentinelPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.any().optional(),
  issue: z.any().optional(),
  review: z.any().optional(),
  comment: z.any().optional(),
}).passthrough();

type SentinelPayload = z.infer<typeof SentinelPayloadSchema>;

export class SentinelInterceptor extends BaseAutomation<SentinelPayload> {
  static readonly metadata: AutomationMetadata = {
    key: "sentinel-interceptor",
    domain: "pr",
    description:
      "Analyzes PRs against architectural memory and posts AI-driven findings. Triggered by Gemini code assist, user slash commands, or PR diff guardrails.",
    events: ["pull_request", "pull_request_review", "issue_comment"],
    alwaysOn: true,
    authPolicy: "pat",
  };

  async shouldRun(): Promise<boolean> {
    const parsed = SentinelPayloadSchema.safeParse(this.payload);
    if (!parsed.success) return false;
    const { action, issue, review, comment } = parsed.data;

    // Trigger 1: Guardrail Checking for Push/Open (handled deeper in run)
    if (this.eventName === "pull_request" && (action === "opened" || action === "synchronize" || action === "reopened")) {
      return true; 
    }
    
    // Trigger 2: Gemini Review Completion
    if (this.eventName === "pull_request_review" && action === "submitted") {
      if (review?.user?.login === "gemini-code-assist") {
        return true;
      }
    }

    // Trigger 3: Slash Command `/colby review` or `@colby review`
    if (this.eventName === "issue_comment" && action === "created") {
      if (issue?.pull_request && comment?.body) {
        if (comment.body.includes("/colby review") || comment.body.includes("@colby review")) {
          return true;
        }
      }
    }

    return false;
  }

  async run(): Promise<void> {
    const logger = new Logger(this.env, "sentinel-interceptor");
    const payload = SentinelPayloadSchema.parse(this.payload);
    const { repository } = payload;
    
    const repoFullName = repository.full_name;
    const owner = repository.owner.login;
    const repo = repository.name;
    const issueNumber = payload.pull_request?.number || payload.issue?.number;

    if (!issueNumber) {
      logger.warn("Payload missing pull_request and issue number", { eventName: this.eventName });
      await logger.flush();
      return;
    }

    try {
      const octokit = await this.getGitHubClient();

      // Ensure we have a populated PR object to access title, body, user
      let pr = payload.pull_request;
      if (!pr || !pr.title) {
        const { data } = await octokit.rest.pulls.get({
           owner,
           repo,
           pull_number: issueNumber
        });
        pr = data;
      }

      // Step 1: Determination & Guardrail Traceability
      let triggerReason = "";
      let diff = "";

      // Fetch that diff early since we might need it for Guardrails AND the prompt
      try {
        const { data: patchData } = await octokit.rest.pulls.get({
           owner,
           repo,
           pull_number: issueNumber,
           mediaType: { format: "diff" },
        });
        diff = typeof patchData === "string" ? patchData : JSON.stringify(patchData);
      } catch (err) {
        logger.warn("Failed to fetch PR diff", { error: err instanceof Error ? err.message : String(err) });
      }

      if (this.eventName === "pull_request_review") {
        triggerReason = "Triggered by: Gemini Code Assist Review Submission";
        logger.info("Sentinel running via Gemini Submission", { repoFullName, issueNumber });
      } else if (this.eventName === "issue_comment") {
        triggerReason = "Triggered by: Slash Command (User requested Review)";
        logger.info("Sentinel running via User Slash Command", { repoFullName, issueNumber });
      } else if (this.eventName === "pull_request") {
        // Run Guardrails Check against additions
        const guardrails = [
          { name: "Node.js Hallucination", regex: /(process\.env|__dirname|import.*from\s+['"]fs['"]|import.*from\s+['"]path['"])/i },
          { name: "Type Evasion", regex: /(@ts-ignore|@ts-nocheck|as\s+any|:\s*any)/i },
          { name: "D1 SQL Injection", regex: /\.prepare\(['"][^'"]*\$\{[^}]*\}/i },
          { name: "Legacy Syntax", regex: /addEventListener\(['"]fetch['"]/i },
          { name: "Driver Mismatch", regex: /(better-sqlite3|mysql2|pg)/i },
          { name: "Manual Env definition", regex: /(interface|type)\s+Env/i }
        ];

        const additionLines = diff
          .split('\\n')
          .filter(line => line.startsWith('+') && !line.startsWith('+++'))
          .join('\\n');

        const matchedGuardrails: string[] = [];
        for (const guard of guardrails) {
          if (guard.regex.test(additionLines)) {
            matchedGuardrails.push(guard.name);
          }
        }

        if (matchedGuardrails.length > 0) {
          triggerReason = `Triggered by Guardrail Alert: ${matchedGuardrails.join(", ")}`;
          logger.info(`Guardrail match found`, { repoFullName, issueNumber, matches: matchedGuardrails });
        } else {
          // No guardrails matched! Short-circuit out immediately
          logger.info("Sentinel analysis skipped: No guardrail violations detected on synchronize.", { repoFullName, issueNumber });
          await this.logExecution('skipped', 'No guardrail violations detected.', issueNumber);
          await logger.flush();
          return; 
        }
      } else {
         triggerReason = `Triggered by Unexpected Event (${this.eventName})`;
      }

      // Step 2: Post initial analysis comment
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: `🔍 **Sentinel** is analyzing this PR based on system guardrails...\n> _${triggerReason}_\n`,
      });

      // Step 3: Query architectural memory
      const db = getDb(this.env.DB);
      const repoInsights = await db
        .select()
        .from(learningAiInsights)
        .where(
          and(
            eq(learningAiInsights.repo, repoFullName),
            eq(learningAiInsights.status, "proposed")
          )
        )
        .limit(10);

      // Step 4: Check Vectorize for similar patterns
      let vectorMatches: string[] = [];
      try {
        const embedding = await this.env.AI.run(
          "@cf/baai/bge-large-en-v1.5" as any,
          { text: [(pr?.title || "") + "\\n" + (pr?.body || "")] }
        );
        const vectors = (embedding as any).data?.[0];
        if (vectors) {
          const matches = await this.env.VECTORIZE.query(vectors, {
            topK: 5,
            namespace: "learning",
          });
          vectorMatches = (matches.matches || [])
            .filter((m: any) => m.score > 0.75)
            .map(
              (m: any) =>
                `- ${m.metadata?.text?.substring(0, 200) || "Similar pattern detected"} (score: ${m.score.toFixed(2)})`
            );
        }
      } catch (err) {
        logger.warn("Vectorize query failed", { error: err instanceof Error ? err.message : String(err) });
      }

      // Step 5: Run AI analysis
      const analysisPrompt = `Analyze this PR diff for architectural anti-patterns, style drift, or improvements based on these known patterns:

**Known Immunized Insights for ${repoFullName}:**
${repoInsights.map((i) => `- [${i.patternType}/${i.severity}] ${i.description?.substring(0, 200)}`).join("\\n") || "None yet."}

**Vector Similarity Matches:**
${vectorMatches.join("\\n") || "No similar prior patterns found."}

**PR Title:** ${pr?.title || 'Unknown'}
**PR Description:** ${pr?.body || "No description provided."}

**Diff (truncated to 50000 chars):**
\`\`\`
${diff.substring(0, 50000)}
\`\`\`

Respond with a concise analysis. If you detect anti-patterns or potential issues, list them as bullet points. If the PR looks clean, say so briefly. Include severity (low/medium/high) for each finding.`;

      const aiResponse = await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
        {
          messages: [
            {
              role: "system",
              content:
                "You are Sentinel, an architectural analysis bot. Be concise, actionable, and constructive. Format findings as GitHub-flavored markdown.",
            },
            { role: "user", content: analysisPrompt },
          ],
          max_tokens: 1000,
        }
      );

      const analysis = (aiResponse as any).response || "Analysis unavailable.";

      // Step 6: Post summary comment
      const baseUrl = (this.env as any).BASE_URL || "https://core-github-api.hacolby.workers.dev";
      const authorLogin = pr?.user?.login || "Unknown";
      const isBot = pr?.user?.type === "Bot" ? "(Bot)" : "";
      
      const summaryBody = `## 🛡️ Sentinel Analysis
_📌 ${triggerReason}_

${analysis}

---

<details>
<summary>📊 Context</summary>

- **Immunized patterns for this repo:** ${repoInsights.length}
- **Similar prior patterns:** ${vectorMatches.length}
- **PR Author:** ${authorLogin} ${isBot}

[View full insights →](${baseUrl}/sentinel)

</details>

*Powered by Sentinel Learning Engine*`;

      // Update the initial comment (or post new one)
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: summaryBody,
      });

      logger.info(`Sentinel analysis posted`, { repoFullName, issueNumber });
      await this.logExecution(
        "success",
        `Sentinel analysis posted for PR #${issueNumber} (${triggerReason})`,
        issueNumber
      );
      
      await logger.flush();
    } catch (err: any) {
      logger.error(`Failed to analyze PR`, { repoFullName, issueNumber, error: err.message, stack: err.stack });
      await this.logExecution(
        "failure",
        `Failed: ${err.message}`,
        issueNumber
      );
      await logger.flush();
    }
  }
}
