/**
 * @file sandbox-sdk/git.ts
 * @description Git integration health check.
 *
 * Consolidated from `ai/mcp/tools/github/git-sandbox-health.ts`.
 * Validates GitHub API authentication via token verification.
 */

import { HealthStepResult } from "@/health/types";
import { verifyGitHubToken } from "@/ai/mcp/tools/github/github";

/** Timeout utility — prevents any health check step from hanging. */
const withTimeout = <T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout exceeded for ${stepName} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

/**
 * Checks the health of the Git domain by verifying GitHub API authentication.
 */
export async function checkGitHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  try {
    const authStart = Date.now();
    const authResult = await withTimeout(verifyGitHubToken(env), 5000, "GitHub Auth");
    subChecks.githubAuth = {
      status: authResult.valid ? "OK" : "FAIL",
      latency: Date.now() - authStart,
      ...(authResult.valid ? { user: authResult.user } : { error: authResult.error }),
    };

    const isOverallSuccess = subChecks.githubAuth?.status !== "FAIL";

    return {
      name: "Git Integration",
      status: isOverallSuccess ? "success" : "failure",
      message: isOverallSuccess ? "GitHub Auth Operational" : "GitHub Auth degraded",
      durationMs: Date.now() - start,
      details: subChecks,
    };
  } catch (error) {
    return {
      name: "Git Integration",
      status: "failure",
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
      details: subChecks,
    };
  }
}
