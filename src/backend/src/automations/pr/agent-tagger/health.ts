/**
 * @file automations/pr/agent-tagger/health.ts
 * @description Health check for the AgentTagger automation.
 * Validates PAT token and access to the health test repo.
 */

import { HealthStepResult } from "@/health/types";
import { Octokit } from "@octokit/rest";

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
    if (!token) throw new Error("PAT token missing — AgentTagger requires PAT auth policy");
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.users.getAuthenticated();
    return { message: "PAT authenticated", user: data.login };
  });

  await runCheck("test_repo_access", async () => {
    const owner = env.GITHUB_OWNER;
    const repo = env.HEALTH_TEST_REPO_NAME;
    if (!owner || !repo) throw new Error("GITHUB_OWNER or HEALTH_TEST_REPO_NAME missing");
    const secret = env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const token = typeof secret === "string" ? secret : await secret?.get?.();
    if (!token) throw new Error("PAT token missing");
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return { message: `Repo ${data.full_name} accessible`, private: data.private };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
  return {
    name: "AgentTagger",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "AgentTagger dependencies degraded" : "AgentTagger healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
