import type { PlanningRequestStatus } from "@/lib/schemas/jules";

export type PlanningMonitorEventType =
  | "STATUS"
  | "PLAN"
  | "MESSAGE"
  | "PROGRESS"
  | "DIFF_SUMMARY"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "ARTIFACT_READY"
  | "COMPLETED"
  | "ERROR";

export interface PlanningArtifactUrls {
  viewUrl: string;
  rawUrl: string;
  downloadUrl: string;
}

export interface PlanningMonitorFileChange {
  path: string;
  changeType?: string;
  additions?: number;
  deletions?: number;
}

export interface PlanningMonitorEvent {
  requestId: string;
  type: PlanningMonitorEventType;
  ts: string;
  status?: PlanningRequestStatus;
  title?: string;
  message?: string;
  plan?: {
    steps: Array<{
      id?: string;
      index?: number;
      title: string;
      description?: string;
    }>;
  };
  files?: PlanningMonitorFileChange[];
  artifact?: PlanningArtifactUrls & { key: string };
  data?: unknown;
}

export interface PlanningMonitorSnapshot {
  requestId: string;
  status: PlanningRequestStatus;
  updatedAt: string;
  plan?: PlanningMonitorEvent["plan"];
  latestMessage?: string;
  latestProgress?: {
    title?: string;
    message?: string;
  };
  latestDiff?: PlanningMonitorFileChange[];
  artifact?: PlanningMonitorEvent["artifact"];
  recentEvents: PlanningMonitorEvent[];
}

function getPlanningMonitorStub(env: Env, requestId: string) {
  const id = env.PLANNING_MONITOR.idFromName(requestId);
  return env.PLANNING_MONITOR.get(id);
}

export async function broadcastPlanningEvent(
  env: Env,
  requestId: string,
  event: Omit<PlanningMonitorEvent, "requestId" | "ts"> &
    Partial<Pick<PlanningMonitorEvent, "requestId" | "ts">>,
): Promise<void> {
  const stub = getPlanningMonitorStub(env, requestId);
  await stub.fetch("http://internal/internal/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId,
      ts: event.ts || new Date().toISOString(),
      ...event,
    } satisfies PlanningMonitorEvent),
  });
}
