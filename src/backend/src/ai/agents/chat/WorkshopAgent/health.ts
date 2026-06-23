/**
 * @file WorkshopAgent/health.ts
 * @description Health probe for WorkshopAgent.
 */
import type { WorkshopHealth } from "./types";

export function buildWorkshopHealth(activeProjectId?: string): WorkshopHealth {
  return {
    status: "ok",
    agent: "WorkshopAgent",
    timestamp: new Date().toISOString(),
    activeProjectId,
  };
}
