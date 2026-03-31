/**
 * @file automations/issues/health.ts
 * @description Health check for issue-domain automations: BugHunter, JulesAutoFix, TaskSync.
 */

import { HealthStepResult } from "@/health/types";
import { getDb } from "@db";
import { repos, tasks } from "@db/schema";

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

  // BugHunter: requires SANDBOX binding
  await runCheck("bug_hunter_sandbox", async () => {
    if (!(env as any).SANDBOX) throw new Error("SANDBOX binding missing — BugHunter cannot generate reproduction tests");
    return { message: "SANDBOX binding present for BugHunter" };
  });

  // JulesAutoFix: requires Jules SDK env vars
  await runCheck("jules_auto_fix", async () => {
    const secret = env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const token = typeof secret === "string" ? secret : await secret?.get?.();
    if (!token) throw new Error("PAT missing — JulesAutoFix requires PAT auth");
    return { message: "Jules auto-fix dependencies present" };
  });

  // TaskSync: requires DB + repos/tasks tables
  await runCheck("task_sync_db", async () => {
    if (!env.DB) throw new Error("DB binding missing");
    const db = getDb(env.DB);
    const repoCount = await db.select().from(repos).limit(1);
    const taskCount = await db.select().from(tasks).limit(1);
    return {
      message: "repos and tasks tables accessible",
      reposFound: repoCount.length,
      tasksFound: taskCount.length,
    };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");

  return {
    name: "Issues Automations",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "Issues automations degraded" : "Issues automations healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
