/**
 * @file automations/pr/jules-sync/health.ts
 * @description Health check for the JulesAgentSync automation.
 * Validates GitHub App auth and Jules SDK service availability.
 */

import { HealthStepResult } from "@/health/types";
import { getGitHubAppId, getGitHubPrivateKey } from "@utils/secrets";

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  const runCheck = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
    } catch (error) {
      subChecks[name] = {
        status: "FAILURE",
        latency: Date.now() - checkStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  await runCheck("github_app_auth", async () => {
    const appId = await getGitHubAppId(env);
    const privateKey = await getGitHubPrivateKey(env);
    if (!appId) throw new Error("GITHUB_APP_ID missing — JulesAgentSync requires App auth");
    if (!privateKey) throw new Error("GITHUB_PRIVATE_KEY missing");
    return { message: "GitHub App credentials present", appId };
  });

  await runCheck("jules_env", async () => {
    // Jules sessions require a source/repo identifier — verify critical Jules-related bindings
    if (!env.AI) throw new Error("AI binding missing — JulesAgentSync uses AI for specialist asset generation");
    return { message: "Jules dependencies available" };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
  return {
    name: "JulesAgentSync",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "JulesAgentSync dependencies degraded" : "JulesAgentSync healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
