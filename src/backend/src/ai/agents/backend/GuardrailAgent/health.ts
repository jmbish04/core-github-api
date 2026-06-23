/**
 * @file GuardrailAgent/health.ts
 * @description Dedicated health file extracted from inline healthProbe().
 *              Re-used by the existing inline method for backward compat.
 */
import type { GuardrailHealth } from "./types";

export function buildGuardrailHealth(ctx: DurableObjectState): GuardrailHealth {
  let cachedRules = 0;
  let recentEvaluations = 0;

  try {
    const rulesRow = ctx.storage.sql.exec(
      `SELECT COUNT(*) as cnt FROM guardrail_rule_cache`,
    ).toArray();
    cachedRules = (rulesRow[0] as any)?.cnt ?? 0;

    const evalsRow = ctx.storage.sql.exec(
      `SELECT COUNT(*) as cnt FROM guardrail_evaluations
       WHERE evaluated_at > datetime('now', '-24 hours')`,
    ).toArray();
    recentEvaluations = (evalsRow[0] as any)?.cnt ?? 0;
  } catch {
    // Tables may not exist yet
  }

  return {
    status: "ok",
    agent: "GuardrailAgent",
    timestamp: new Date().toISOString(),
    cachedRules,
    recentEvaluations,
  };
}
