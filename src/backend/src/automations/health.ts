/**
 * @file automations/health.ts
 * @description Top-level barrel aggregator for all automation domain health checks.
 *
 * Aggregates results from:
 * - Core (registry, auth, DB)
 * - Issues (BugHunter, JulesAutoFix, TaskSync)
 * - PR (7 sub-automations)
 * - Push / Sandbox SDK operations
 */

import { HealthStepResult } from "@/health/types";
import { checkHealth as checkCoreHealth } from "./core/health";
import { checkHealth as checkIssuesHealth } from "./issues/health";
import { checkHealth as checkPRHealth } from "./pr/health";
import { checkHealth as checkPushSandboxHealth } from "./push/operations/sandbox-sdk/health";

interface DomainCheck {
  id: string;
  fn: (env: Env) => Promise<HealthStepResult>;
}

const DOMAIN_CHECKS: DomainCheck[] = [
  { id: "core", fn: checkCoreHealth },
  { id: "issues", fn: checkIssuesHealth },
  { id: "pr", fn: checkPRHealth },
  { id: "push-sandbox", fn: checkPushSandboxHealth },
];

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const results: Record<string, any> = {};
  let allHealthy = true;

  for (const check of DOMAIN_CHECKS) {
    try {
      const result = await check.fn(env);
      results[check.id] = {
        status: result.status,
        name: result.name,
        message: result.message,
        durationMs: result.durationMs,
        details: result.details,
      };
      if (result.status !== "success") allHealthy = false;
    } catch (error) {
      results[check.id] = {
        status: "failure",
        error: error instanceof Error ? error.message : String(error),
      };
      allHealthy = false;
    }
  }

  return {
    name: "Automations",
    status: allHealthy ? "success" : "failure",
    message: allHealthy
      ? "All automation domains healthy"
      : "One or more automation domains degraded",
    durationMs: Date.now() - start,
    details: results,
  };
}
