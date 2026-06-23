import { PlanningCaptureState } from "../types";

export function createEmptyPlanningCapture(): PlanningCaptureState {
  return {
    seenActivityIds: [],
    planSteps: [],
    agentMessages: [],
    progressUpdates: [],
    diffSummaries: [],
  };
}
