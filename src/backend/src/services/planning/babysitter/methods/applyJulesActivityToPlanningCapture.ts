import { PlanningCaptureState } from "../types";
import { recordSeen, toArray } from "../utils";

export function applyJulesActivityToPlanningCapture(
  state: PlanningCaptureState,
  activity: any,
): PlanningCaptureState {
  if (!activity?.id || !recordSeen(state, activity.id)) {
    return state;
  }

  switch (activity.type) {
    case "planGenerated":
      state.planSteps = toArray(activity.plan?.steps).map((step: any) => ({
        id: step.id,
        index: step.index,
        title: step.title,
        description: step.description,
      }));
      break;
    case "agentMessaged":
      state.agentMessages.push({
        id: activity.id,
        createTime: activity.createTime,
        message: activity.message,
      });
      break;
    case "progressUpdated": {
      state.progressUpdates.push({
        id: activity.id,
        createTime: activity.createTime,
        title: activity.title,
        description: activity.description,
      });

      const files = toArray(activity.artifacts)
        .filter((artifact: any) => artifact?.type === "changeSet")
        .flatMap((artifact: any) => {
          const parsed = typeof artifact.parsed === "function" ? artifact.parsed() : null;
          return toArray(parsed?.files).map((file: any) => ({
            path: file.path,
            changeType: file.changeType,
            additions: file.additions,
            deletions: file.deletions,
          }));
        });

      if (files.length > 0) {
        state.diffSummaries.push({
          activityId: activity.id,
          createTime: activity.createTime,
          files,
        });
      }
      break;
    }
    case "sessionCompleted":
      state.completedAt = activity.createTime;
      break;
    case "sessionFailed":
      state.failedReason = activity.reason || "Jules session failed";
      break;
    default:
      break;
  }

  return state;
}
