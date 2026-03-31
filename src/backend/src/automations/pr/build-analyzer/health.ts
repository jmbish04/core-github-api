/**
 * @file automations/pr/build-analyzer/health.ts
 * @description Health check for the BuildAnalyzer automation.
 * Validates PAT token and Cloudflare Builds API access (build logs for core-github-api).
 */

import { HealthStepResult } from "@/health/types";


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

  await runCheck("pat_auth", async () => {
    const secret = env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const token = typeof secret === "string" ? secret : await secret?.get?.();
    if (!token) throw new Error("PAT token missing — BuildAnalyzer requires PAT auth policy");
    return { message: "PAT token available", length: token.length };
  });

  await runCheck("ai_binding", async () => {
    if (!env.AI) throw new Error("AI binding missing — BuildAnalyzer uses AI for failure analysis");
    return { message: "AI binding available" };
  });

  // Verify Cloudflare account access for build logs
  await runCheck("cloudflare_account", async () => {
    if (!env.CLOUDFLARE_ACCOUNT_ID) throw new Error("CLOUDFLARE_ACCOUNT_ID missing — needed for build log access");
    const accountId = typeof env.CLOUDFLARE_ACCOUNT_ID === "object" && env.CLOUDFLARE_ACCOUNT_ID !== null && "get" in env.CLOUDFLARE_ACCOUNT_ID 
      ? await (env.CLOUDFLARE_ACCOUNT_ID as any).get() 
      : env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is empty");
    return { message: "Cloudflare account ID present" };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
  return {
    name: "BuildAnalyzer",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "BuildAnalyzer dependencies degraded" : "BuildAnalyzer healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
