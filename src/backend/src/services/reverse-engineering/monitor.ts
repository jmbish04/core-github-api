import type { ReverseEngineeringStatus } from '@/lib/schemas/reverse-engineering';
import { createReverseEngineeringEvent } from './store';
import { BroadcastClient } from '@utils/do-broadcast';

export type ReverseEngineeringMonitorEventType =
  | 'STATUS'
  | 'REPO_RESEARCH'
  | 'AUTH_REQUIRED'
  | 'URL_RESOLVED'
  | 'SCREENSHOT_CAPTURED'
  | 'VISION_ANALYZED'
  | 'JULES_PARALLEL_STARTED'
  | 'JULES_PARALLEL_RESULT'
  | 'FINAL_SYNTHESIS'
  | 'COMPLETE'
  | 'ERROR';

export interface ReverseEngineeringMonitorEvent {
  snapshotId: string;
  type: ReverseEngineeringMonitorEventType;
  ts: string;
  status?: ReverseEngineeringStatus;
  title?: string;
  message?: string;
  data?: unknown;
}

export interface ReverseEngineeringMonitorSnapshot {
  snapshotId: string;
  status: ReverseEngineeringStatus;
  updatedAt: string;
  latestMessage?: string;
  screenshotUrls?: string[];
  resolvedPreviewUrl?: string;
  recentEvents: ReverseEngineeringMonitorEvent[];
}



export async function broadcastReverseEngineeringEvent(
  env: Env,
  snapshotId: string,
  event: Omit<ReverseEngineeringMonitorEvent, 'snapshotId' | 'ts'> & Partial<Pick<ReverseEngineeringMonitorEvent, 'snapshotId' | 'ts'>>,
): Promise<void> {
  const normalized: ReverseEngineeringMonitorEvent = {
    snapshotId,
    ts: event.ts || new Date().toISOString(),
    ...event,
  };

  await createReverseEngineeringEvent(env, {
    snapshotId,
    eventType: normalized.type,
    title: normalized.title,
    message: normalized.message,
    payload: {
      status: normalized.status,
      data: normalized.data,
      ts: normalized.ts,
    },
  });

  await BroadcastClient.broadcast(env.REVERSE_ENGINEERING_MONITOR, snapshotId, normalized);
}
