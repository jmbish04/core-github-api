/**
 * @file src/ai/agents/EngineerAgent/types.ts
 * @description Type definitions for the EngineerAgent — manages SWE Fleet,
 *              Jules sessions, Stitch builds, and milestone tracking.
 */

export interface StitchFleetRecord {
  id: string;
  workerId: string;
  status: "idle" | "running" | "completed" | "failed";
}

export type MilestoneStatus =
  | "staged"
  | "in_progress"
  | "pending_review"
  | "blocked"
  | "complete"
  | "failed";

export interface MilestoneEvent {
  requestId: string;
  sessionId?: string;
  name: string;            // e.g. 'brain:evaluate', 'jules:session-1', 'stitch:page-dashboard'
  status: MilestoneStatus;
  detail?: string;
  timestamp: number;
}

export interface Sprint {
  id: string;
  requestId: string;
  title: string;
  subtasks: Subtask[];
  priority: "low" | "medium" | "high" | "critical";
  status: "queued" | "active" | "completed" | "failed";
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  files?: string[];        // Files to modify
  role: "solo" | "fleet-member" | "stitch" | "merge";
  sessionId?: string;      // Jules session ID once dispatched
  status: "pending" | "active" | "completed" | "failed";
}

import type { PersistentAgentState } from "../../../providers/agent-support/types";

export interface EngineerState extends PersistentAgentState {
  activeSprints: Record<string, Sprint>;
  fleetStatus: Record<string, StitchFleetRecord>;
  milestones: MilestoneEvent[];
}

/** Decision type from the Brain method. */
export type BrainDecision = "solo" | "fleet" | "triangle" | "stitch-only";

export interface BrainEvaluation {
  decision: BrainDecision;
  reasoning: string;
  subtasks: Subtask[];
  estimatedComplexity: "low" | "medium" | "high";
}
