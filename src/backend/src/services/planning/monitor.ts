import type { PlanningRequestStatus } from "@/lib/schemas/jules";
import { createPlanningEvent } from "./store";
import { BroadcastClient } from '@utils/do-broadcast';

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
  source?: "api" | "workflow" | "jules" | "stitch" | "agent" | "system" | "user";
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



export async function broadcastPlanningEvent(
  env: Env,
  requestId: string,
  event: Omit<PlanningMonitorEvent, "requestId" | "ts"> &
    Partial<Pick<PlanningMonitorEvent, "requestId" | "ts">>,
): Promise<void> {
  const normalized = {
    requestId,
    ts: event.ts || new Date().toISOString(),
    source: event.source || "system",
    ...event,
  } satisfies PlanningMonitorEvent;

  await createPlanningEvent(env, {
    requestId,
    source: normalized.source || "system",
    eventType: normalized.type,
    title: normalized.title,
    message: normalized.message,
    payload: {
      status: normalized.status,
      plan: normalized.plan,
      files: normalized.files,
      artifact: normalized.artifact,
      data: normalized.data,
      ts: normalized.ts,
    },
  });

  await BroadcastClient.broadcast(env.PLANNING_MONITOR, requestId, normalized);
}
