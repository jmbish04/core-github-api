/**
 * @file automations/pr/doc-string-generator/health.ts
 * @description Health check for the DocstringGenerator automation.
 * Validates GitHub App auth and AI binding for docstring generation.
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
    if (!appId) throw new Error("GITHUB_APP_ID missing — DocstringGenerator requires App auth");
    if (!privateKey) throw new Error("GITHUB_PRIVATE_KEY missing");
    return { message: "GitHub App credentials present", appId };
  });

  await runCheck("ai_binding", async () => {
    if (!env.AI) throw new Error("AI binding missing — DocstringGenerator uses AI for docstring generation");
    return { message: "AI binding available" };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
  return {
    name: "DocstringGenerator",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "DocstringGenerator dependencies degraded" : "DocstringGenerator healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
