/**
 * @file OrchestratorAgent/health.ts
 * @description Health probe for OrchestratorAgent.
 */
export interface OrchestratorHealth {
  status: string;
  agent: string;
  timestamp: string;
}

import { HealthStepResult } from "@/health/types";

export function buildOrchestratorHealth(): OrchestratorHealth {
  return {
    status: "ok",
    agent: "OrchestratorAgent",
    timestamp: new Date().toISOString(),
  };
}

export async function checkOrchestrationHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  try {
    const data = buildOrchestratorHealth();
    return {
      name: "OrchestratorAgent",
      status: "success",
      message: "OrchestratorAgent is operational",
      durationMs: Date.now() - start,
      details: data
    };
  } catch (e: any) {
    return {
      name: "OrchestratorAgent",
      status: "failure",
      message: e.message,
      durationMs: Date.now() - start
    };
  }
}
