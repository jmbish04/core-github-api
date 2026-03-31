/**
 * @file automations/pr/health.ts
 * @description Barrel aggregator for all PR automation health checks.
 * Collects results from 7 sub-automations into a single HealthStepResult.
 */

import { HealthStepResult } from "@/health/types";
import { checkHealth as checkAgentTagger } from "./agent-tagger/health";
import { checkHealth as checkBuildAnalyzer } from "./build-analyzer/health";
import { checkHealth as checkDocstringGen } from "./doc-string-generator/health";
import { checkHealth as checkGeminiReview } from "./gemini-review/health";
import { checkHealth as checkIngest } from "./ingest/health";
import { checkHealth as checkJulesSync } from "./jules-sync/health";
import { checkHealth as checkReviewExtraction } from "./review-extraction/health";

interface SubCheck {
  id: string;
  fn: (env: Env) => Promise<HealthStepResult>;
}

const PR_CHECKS: SubCheck[] = [
  { id: "agent-tagger", fn: checkAgentTagger },
  { id: "build-analyzer", fn: checkBuildAnalyzer },
  { id: "doc-string-generator", fn: checkDocstringGen },
  { id: "gemini-review", fn: checkGeminiReview },
  { id: "ingest", fn: checkIngest },
  { id: "jules-sync", fn: checkJulesSync },
  { id: "review-extraction", fn: checkReviewExtraction },
];

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const results: Record<string, any> = {};
  let allHealthy = true;

  for (const check of PR_CHECKS) {
    try {
      const result = await check.fn(env);
      results[check.id] = {
        status: result.status,
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
    name: "PR Automations",
    status: allHealthy ? "success" : "failure",
    message: allHealthy ? "All 7 PR automations healthy" : "One or more PR automations degraded",
    durationMs: Date.now() - start,
    details: results,
  };
}
