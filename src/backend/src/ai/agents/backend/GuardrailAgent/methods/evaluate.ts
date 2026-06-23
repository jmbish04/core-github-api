import type { GuardrailAgent } from "../index";
import type { EvaluationPayload, Verdict, VerdictIssue, CorrectionPrompt } from "../types";
import { fetchCloudflareGoldenPath } from "./cloudflare-docs";
import { checkStandards } from "./standards";
import { judgeCodeQuality } from "./judge";
import { getDb } from "@db";
import { guardrailEvaluations, guardrailRuleCache } from "@db/schemas/agents/mirror";

/**
 * Core evaluation orchestrator. Runs static analysis (golden-path + standards)
 * and AI code review (judge) in parallel, then merges results.
 *
 * Every verdict is:
 *   1. Written to the DO SQLite table `guardrail_evaluations` (fast, local)
 *   2. Mirrored to D1 `guardrail_evaluations` (durable, queryable from frontend)
 */
export async function evaluatePayload(
  agent: GuardrailAgent,
  payload: EvaluationPayload,
): Promise<Verdict> {
  const allIssues: VerdictIssue[] = [];
  const allCorrections: CorrectionPrompt[] = [];

  // Run all checks in parallel — both golden-path and standards take (agent, payload)
  const [goldenPath, standards, judgeResult] = await Promise.allSettled([
    fetchCloudflareGoldenPath(agent, payload),
    checkStandards(agent, payload),
    judgeCodeQuality(agent, payload),
  ]);

  // Collect issues from each source
  if (goldenPath.status === "fulfilled") {
    allIssues.push(...goldenPath.value.issues);
    allCorrections.push(...goldenPath.value.corrections);
  }
  if (standards.status === "fulfilled") {
    allIssues.push(...standards.value.issues);
    allCorrections.push(...standards.value.corrections);
  }
  if (judgeResult.status === "fulfilled") {
    allIssues.push(...judgeResult.value.issues);
    allCorrections.push(...judgeResult.value.corrections);
  }

  // Compute score
  const errorCount = allIssues.filter((i) => i.severity === "error" || i.severity === "critical").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, 100 - errorCount * 20 - warningCount * 5);

  const status: Verdict["status"] = errorCount > 0 ? "fail" : warningCount > 2 ? "warn" : "pass";

  const verdict: Verdict = {
    status,
    score,
    issues: allIssues,
    corrections: allCorrections,
    evaluatedAt: new Date().toISOString(),
  };

  const agentId = (agent as any).ctx?.id?.toString() ?? "unknown";

  // 1. Persist in DO SQLite (fast, local, survives within the DO's lifetime)
  try {
    (agent as any).ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO guardrail_evaluations (request_id, status, score, issues_json, evaluated_at)
       VALUES (?, ?, ?, ?, ?)`,
      payload.requestId,
      verdict.status,
      verdict.score,
      JSON.stringify(allIssues),
      verdict.evaluatedAt,
    );
  } catch (err) {
    console.error("[GuardrailAgent:evaluate] Failed to persist verdict to DO SQLite:", err);
  }

  // 2. Mirror to D1 (durable, survives redeploy, queryable from frontend)
  try {
    const db = getDb((agent as any).env.DB);
    await db
      .insert(guardrailEvaluations)
      .values({
        requestId: payload.requestId,
        agentId,
        status: verdict.status,
        score: verdict.score,
        issuesJson: JSON.stringify(allIssues),
        evaluatedAt: verdict.evaluatedAt,
      })
      .onConflictDoUpdate({
        target: guardrailEvaluations.requestId,
        set: {
          status: verdict.status,
          score: verdict.score,
          issuesJson: JSON.stringify(allIssues),
          evaluatedAt: verdict.evaluatedAt,
        },
      });
  } catch (err) {
    console.error("[GuardrailAgent:evaluate] Failed to mirror verdict to D1:", err);
  }

  return verdict;
}

/**
 * Mirror a single rule cache entry to D1 so it survives redeploy.
 * Call after writing to DO SQLite `guardrail_rule_cache`.
 */
export async function mirrorRuleCacheToD1(
  agent: GuardrailAgent,
  ruleKey: string,
  content: string,
): Promise<void> {
  const agentId = (agent as any).ctx?.id?.toString() ?? "unknown";
  try {
    const db = getDb((agent as any).env.DB);
    await db
      .insert(guardrailRuleCache)
      .values({
        ruleKey,
        agentId,
        content,
        cachedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: guardrailRuleCache.ruleKey,
        set: {
          content,
          agentId,
          cachedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[GuardrailAgent] Failed to mirror rule cache to D1:", err);
  }
}

/**
 * On `onStart()`, warm the DO SQLite rule cache from D1 so the agent
 * does not need to re-fetch docs after a redeploy.
 */
export async function warmRuleCacheFromD1(agent: GuardrailAgent): Promise<void> {
  const agentId = (agent as any).ctx?.id?.toString() ?? "unknown";
  try {
    const db = getDb((agent as any).env.DB);
    const rows = await db
      .select()
      .from(guardrailRuleCache)
      .where(({ ruleKey }: any) => ruleKey); // fetch all rows for this agent
    for (const row of rows) {
      try {
        (agent as any).ctx.storage.sql.exec(
          `INSERT OR REPLACE INTO guardrail_rule_cache (rule_key, content, cached_at)
           VALUES (?, ?, ?)`,
          row.ruleKey,
          row.content,
          row.cachedAt,
        );
      } catch {
        // Non-fatal: DO SQLite tables may not exist yet at this point
      }
    }
  } catch (err) {
    console.warn("[GuardrailAgent] warmRuleCacheFromD1 failed (non-fatal):", err);
  }
}
