/**
 * @file backend/src/services/jules/types.ts
 * @description Shared TypeScript types for the Jules AI coding agent integration.
 *
 * All types in this file are used across the Jules service layer, API routes,
 * Durable Object broadcaster, and database schemas.
 *
 * @module Services/Jules
 */

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Parameters for starting a new Jules coding session.
 * Passed to `JulesService.startSession()`.
 */
export interface StartSessionParams {
  /** The enriched task prompt (will have webhook instructions and coding-agent standards appended). */
  prompt: string;

  /** Optional GitHub repository context for Jules to work on. */
  repo?: {
    /** Repository owner (org or username). */
    owner: string;
    /** Repository name (without owner prefix). */
    repo: string;
    /** Target branch. Defaults to "main". */
    branch?: string;
  };

  /** If true, Jules will automatically open a Pull Request when done. */
  autoPr?: boolean;

  /** If true, Jules pauses at the generated plan and waits for approval. */
  requireApproval?: boolean;

  /** Optional pre-assigned session ID. If omitted, Jules assigns one. */
  sessionId?: string;

  /** ID of the agent Durable Object instance that is creating this session. */
  agentId?: string;

  /** Class name of the originating specialist agent (e.g. "WorkshopAgent"). */
  specialistClass?: string;

  /** Project ID this session belongs to, for cross-session memory retrieval. */
  projectId?: string;
}

// ─── Webhook Event ────────────────────────────────────────────────────────────

/**
 * Enumeration of lifecycle event types Jules can report via webhook.
 *
 * - blocked: Jules is stuck and initiates a request for help
 * - needs_context: Jules needs clarification before proceeding
 * - ready_for_pr: Task complete, PR has been or is ready to be created
 * - done: Session lifecycle ended (terminal)
 * - progress: Incremental update during task execution (non-terminal)
 * - info: Informational message, no action required
 */
export type JulesEventType =
  | "blocked"
  | "needs_context"
  | "ready_for_pr"
  | "done"
  | "progress"
  | "info";

/**
 * Payload expected on `POST /api/webhooks/jules/event`.
 * Jules uses this to report lifecycle events.
 */
export interface JulesEventPayload {
  /** The Jules session ID (assigned by the Jules SDK on session creation). */
  jules_session_id: string;
  /** Classification of the event being reported. */
  event_type: JulesEventType;
  /** Jules-generated human-readable message providing context for the event. */
  message: string;
  /** Optional extra metadata (arbitrary JSON). */
  metadata?: Record<string, unknown>;
}

/**
 * Payload expected on `POST /api/webhooks/jules/status`.
 * Jules uses this for frequent progress updates during task execution.
 */
export interface JulesStatusPayload {
  /** The Jules session ID. */
  jules_session_id: string;
  /** Name or description of the current work step. */
  step_name: string;
  /** Human-readable description of what Jules is currently doing. */
  message: string;
  /** Optional completion percentage (0–100). */
  progress_pct?: number;
}

// ─── WebSocket Broadcast ──────────────────────────────────────────────────────

/**
 * Shape of messages broadcast over the Jules live-feed WebSocket.
 * Frontend consumers receive this shape from `GET /api/webhooks/jules/ws`.
 */
export interface JulesLiveMessage {
  /** ISO timestamp when the event was received by the Worker. */
  ts: string;
  /** Originating Jules session ID. */
  sessionId: string;
  /** Type of event — drives toast styling in the frontend. */
  eventType: JulesEventType | "progress";
  /** Human-readable title for the frontend notification. */
  title: string;
  /** Detailed message content. */
  message: string;
  /** Optional progress percentage (0–100), present for "progress" events. */
  progressPct?: number;
  /** Optional step name for progress events. */
  stepName?: string;
  /** Optional original task summary for context. */
  originalTask?: string;
}
