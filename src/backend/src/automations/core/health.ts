/**
 * @file automations/core/health.ts
 * @description Health check for the core automation framework.
 *
 * Validates:
 * 1. AutomationRegistry loads all expected classes
 * 2. DB_WEBHOOKS is accessible (webhookConfigs table)
 * 3. PAT token is retrievable
 * 4. GitHub App credentials present
 */

import { REGISTERED_AUTOMATIONS } from "./AutomationRegistry";
import { getWebhooksDb } from "@db";
import { webhookConfigs } from "@/db/schemas/webhooks/automations";
import { HealthStepResult } from "@/health/types";
import { getGitHubAppId, getGitHubPrivateKey } from "@utils/secrets";

const EXPECTED_AUTOMATION_COUNT = 18;

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

  // 1. Registry completeness
  await runCheck("registry", async () => {
    const count = REGISTERED_AUTOMATIONS.length;
    if (count < EXPECTED_AUTOMATION_COUNT) {
      throw new Error(`Expected ${EXPECTED_AUTOMATION_COUNT} automations, found ${count}`);
    }
    const names = REGISTERED_AUTOMATIONS.map((a) => a.name);
    return { message: `${count} automations registered`, classes: names };
  });

  // 2. Webhooks DB accessibility  
  await runCheck("webhooks_db", async () => {
    if (!env.DB_WEBHOOKS) throw new Error("DB_WEBHOOKS binding missing");
    const db = getWebhooksDb(env.DB_WEBHOOKS);
    const configs = await db.select().from(webhookConfigs).limit(1);
    return { message: "webhookConfigs table accessible", rowCount: configs.length };
  });

  // 3. PAT token
  await runCheck("pat_token", async () => {
    const secret = env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const token = typeof secret === "string" ? secret : await secret?.get?.();
    if (!token) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN not available");
    return { message: "PAT token retrievable", length: token.length };
  });

  // 4. GitHub App credentials
  await runCheck("github_app_creds", async () => {
    const appId = await getGitHubAppId(env);
    const privateKey = await getGitHubPrivateKey(env);
    if (!appId) throw new Error("GITHUB_APP_ID not available");
    if (!privateKey) throw new Error("GITHUB_PRIVATE_KEY not available");
    return { message: "GitHub App credentials present", appId };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");

  return {
    name: "Automations Core",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "Core automation framework degraded" : "Core automation framework healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
