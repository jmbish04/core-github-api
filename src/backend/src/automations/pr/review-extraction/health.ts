/**
 * @file automations/pr/review-extraction/health.ts
 * @description Health check for the PRReviewExtraction automation.
 * Validates GitHub App auth and DB_WEBHOOKS accessibility.
 */

import { HealthStepResult } from "@/health/types";
import { getGitHubAppId, getGitHubPrivateKey } from "@utils/secrets";
import { getWebhooksDb } from "@db";
import { webhookConfigs } from "@/db/schemas/webhooks/automations";

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
    if (!appId) throw new Error("GITHUB_APP_ID missing — PRReviewExtraction requires App auth");
    if (!privateKey) throw new Error("GITHUB_PRIVATE_KEY missing");
    return { message: "GitHub App credentials present", appId };
  });

  await runCheck("webhooks_db", async () => {
    if (!env.DB_WEBHOOKS) throw new Error("DB_WEBHOOKS binding missing");
    const db = getWebhooksDb(env.DB_WEBHOOKS);
    await db.select().from(webhookConfigs).limit(1);
    return { message: "DB_WEBHOOKS accessible" };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
  return {
    name: "PRReviewExtraction",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "PRReviewExtraction dependencies degraded" : "PRReviewExtraction healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
