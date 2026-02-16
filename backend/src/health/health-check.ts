import { getDb } from "../db";
import { healthRuns } from "../db/schemas/logs/health";
import { checkHealth as checkAI } from "../ai/health";
import { checkHealth as checkMCP } from "../ai/mcp/health";
import { checkGitHubHealth as checkGit } from "../workflows/health";
import { checkHealth as checkAgents } from "../ai/agents/health";
import { checkHealth as checkBrowser } from "../ai/agents/tools/browser/health";
import { analyzeFailure } from "../ai/utils/diagnostician";
import { v4 as uuidv4 } from 'uuid';

import { HealthStepResult, HealthCheckResult } from "./types";
export { HealthStepResult, HealthCheckResult };

/**
 * Health Orchestrator
 * Runs decentralized checks across all domains
 */
export async function runHealthCheck(
  env: Env,
  checkType: string,
  triggerSource: 'cron' | 'api' | 'websocket',
  onProgress?: (step: string, status: 'pending' | 'success' | 'failure' | 'warning' | 'SKIPPED', msg?: string) => void
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const steps: HealthStepResult[] = [];
  const notify = onProgress || (() => { });

  notify("Starting Health Check", "pending", "Initializing...");

  // Define checks sequence
  const checks = [
    // { id: 'db', name: 'Database', fn: checkDB },
    // { id: 'data', name: 'Vectorize', fn: checkData },
    { id: 'ai', name: 'Worker AI', fn: checkAI },
    { id: 'mcp', name: 'MCP Server', fn: checkMCP },
    { id: 'git', name: 'GitHub API', fn: checkGit },
    // { id: 'containers', name: 'Containers', fn: checkContainers },
    { id: 'agents', name: 'Agents', fn: checkAgents },
    // { id: 'workflows', name: 'Workflows', fn: checkWorkflows }
  ];

  try {
    for (const check of checks) {
      notify(check.name, "pending", `Checking ${check.name}...`);

      try {
        const result = await check.fn(env);
        steps.push(result);
        notify(check.name, result.status, result.message);
      } catch (e) {
          const errParams = {
            name: check.name,
            status: 'failure' as const,
            message: e instanceof Error ? e.message : String(e),
            durationMs: 0
          };
          steps.push(errParams);
          notify(check.name, 'failure', errParams.message);
      }
    }

    const totalDuration = Date.now() - startTime;
    const strictSuccess = steps.every(s => s.status === 'success' || s.status === 'SKIPPED');

    let aiAnalysis: string | undefined;
    let aiAnalysisJson: string | undefined;

    if (strictSuccess) {
      notify("Health Check Complete", "success", `Passed in ${totalDuration}ms`);
    } else {
      notify("Health Check Complete", "failure", `Failed in ${totalDuration}ms`);

      // Perform AI Analysis on failure
      try {
        notify("AI Analyst", "pending", "Analyzing root cause...");
        const failedSteps = steps.filter(s => s.status === 'failure');

        // Run specific analysis for each failure
        const analyses = await Promise.all(failedSteps.map(async (step) => {
          const stepName = step.name || "Unknown Step";
          const stepMessage = step.message || "No error message provided";
          const stepDetails = step.details || {};

          console.log("[Diagnostician Input]", { stepName, stepMessage, stepDetails });

          const analysis = await analyzeFailure(env, stepName, stepMessage, stepDetails);
          if (analysis) {
            step.analysis = analysis; // Attach to step Result
            return { step: step.name, analysis };
          }
          return null;
        }));

        const validAnalyses = analyses.filter(a => a !== null);

        if (validAnalyses.length > 0) {
          const analysisMap = validAnalyses.reduce((acc, curr) => {
            acc[curr!.step] = curr!.analysis;
            return acc;
          }, {} as Record<string, any>);

          aiAnalysisJson = JSON.stringify(analysisMap);
          aiAnalysis = validAnalyses.map(a =>
            `[${a!.step}] ${a!.analysis.rootCause} (Fix: ${a!.analysis.suggestedFix})`
          ).join('\n');

          notify("AI Analyst", "success", `Analyzed ${validAnalyses.length} issues`);
        } else {
          notify("AI Analyst", "success", "No specific analysis generated");
        }

      } catch (err) {
        console.error("AI Analysis failed:", err);
        notify("AI Analyst", "failure", "Could not generate analysis");
      }
    }

    // Record result
    await saveHealthCheck(env.DB, {
      checkType,
      triggerSource,
      status: strictSuccess ? 'healthy' : 'unhealthy',
      durationMs: totalDuration,
      steps,
      aiAnalysis, // keep legacy field populated for now
      aiAnalysisJson,
      error: strictSuccess ? undefined : "One or more steps failed"
    });

    return {
      checkType,
      success: strictSuccess,
      steps,
      totalDurationMs: totalDuration
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    notify("Critical Failure", "failure", errorMsg);

    // Record failure
    await saveHealthCheck(env.DB, {
      checkType,
      triggerSource,
      status: 'unhealthy',
      durationMs: totalDuration,
      steps,
      error: errorMsg
    });

    return {
      checkType,
      success: false,
      steps,
      totalDurationMs: totalDuration,
      error: errorMsg
    };
  }
}

async function saveHealthCheck(db: D1Database, result: any) {
  try {
    const client = getDb(db);
    // Map to healthRuns schema
    await client.insert(healthRuns).values({
      id: uuidv4(),
      status: result.status, // already mapped to 'healthy' | 'unhealthy'
      trigger: result.triggerSource === 'cron' ? 'scheduled' : 
               result.triggerSource === 'api' ? 'api' : 'manual',
      duration_ms: result.durationMs,
      metadata: {
        checkType: result.checkType,
        steps: result.steps,
        analysis: result.aiAnalysis,
        analysisJson: result.aiAnalysisJson,
        error: result.error
      }
    });
  } catch (e) {
    console.error("Failed to save health check result:", e);
  }
}

export async function getLatestHealthCheck(db: D1Database) {
  const client = getDb(db);
  // @ts-ignore - simple select
  const result = await client.query.healthRuns.findMany({
    orderBy: (healthRuns, { desc }) => [desc(healthRuns.created_at)],
    limit: 1
  });
  return result[0];
}
