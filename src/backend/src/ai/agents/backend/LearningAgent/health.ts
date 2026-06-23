/**
 * @file LearningAgent/health.ts
 * @description Health probe for LearningAgent.
 */
export interface LearningHealth {
  status: string;
  agent: string;
  timestamp: string;
}

export function buildLearningHealth(): LearningHealth {
  return {
    status: "ok",
    agent: "LearningAgent",
    timestamp: new Date().toISOString(),
  };
}
