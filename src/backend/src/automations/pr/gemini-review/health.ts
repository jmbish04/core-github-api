/**
 * @file automations/pr/gemini-review/health.ts
 * @description Health check for the GeminiReview automation.
 * Validates PAT token and GeminiReviewStatusService import.
 */

import { HealthStepResult } from "@/health/types";
import { GeminiReviewStatusService } from "@/services/github/gemini-review-status";

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
    if (!token) throw new Error("PAT token missing — GeminiReview requires PAT auth policy");
    return { message: "PAT token available" };
  });

  await runCheck("status_service", async () => {
    // Validate the service module is importable and functional
    const testResult = GeminiReviewStatusService.determineStatus("");
    if (!testResult.state) throw new Error("GeminiReviewStatusService.determineStatus returned invalid result");
    return { message: "GeminiReviewStatusService operational", defaultState: testResult.state };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
  return {
    name: "GeminiReview",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "GeminiReview dependencies degraded" : "GeminiReview healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
