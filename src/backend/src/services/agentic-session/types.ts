/**
 * @file services/agentic-session/types.ts
 * @description Zod discriminated-union schemas for SessionEvent types.
 *   Provides type-safe event payloads for the AgenticSession transparency layer.
 */

import { z } from 'zod';

// ── Base Event Metadata ──────────────────────────────────────────────────

/**
 * Base metadata stamped onto every event by the DO at publish time.
 *
 * `sessionId` is NOT validated as a UUID here because the DO uses
 * `this.ctx.id.toString()` — the 64-char hex representation of the DO ID
 * derived via `idFromName(uuid)` — as the canonical session id on the
 * persisted event row. The UUID-form sessionId is only used at the
 * API/client surface (URL params, JWT claims) where the route layer's
 * own zod schemas enforce `.uuid()`.
 */
const BaseEventMetadata = z.object({
  timestamp: z.number().int().positive(),
  sessionId: z.string().min(1),
  sequenceNum: z.number().int().nonnegative(),
});

// ── System Events ────────────────────────────────────────────────────────

export const SystemStartEvent = z.object({
  type: z.literal('system.start'),
  payload: z.object({
    sessionName: z.string().optional(),
    initiatedBy: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  }),
}).merge(BaseEventMetadata);

export const SystemCompleteEvent = z.object({
  type: z.literal('system.complete'),
  payload: z.object({
    status: z.enum(['success', 'partial', 'failed']),
    summary: z.string().optional(),
    duration: z.number().positive().optional(),
  }),
}).merge(BaseEventMetadata);

export const SystemErrorEvent = z.object({
  type: z.literal('system.error'),
  payload: z.object({
    error: z.string(),
    code: z.string().optional(),
    stack: z.string().optional(),
    recoverable: z.boolean().optional(),
  }),
}).merge(BaseEventMetadata);

// ── Agent Events ─────────────────────────────────────────────────────────

export const AgentThoughtEvent = z.object({
  type: z.literal('agent.thought'),
  payload: z.object({
    agentId: z.string(),
    agentName: z.string().optional(),
    thought: z.string(),
    reasoning: z.string().optional(),
  }),
}).merge(BaseEventMetadata);

export const AgentActionEvent = z.object({
  type: z.literal('agent.action'),
  payload: z.object({
    agentId: z.string(),
    agentName: z.string().optional(),
    action: z.string(),
    tool: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
}).merge(BaseEventMetadata);

export const AgentResultEvent = z.object({
  type: z.literal('agent.result'),
  payload: z.object({
    agentId: z.string(),
    agentName: z.string().optional(),
    result: z.unknown(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
}).merge(BaseEventMetadata);

// ── HITL (Human-in-the-Loop) Events ──────────────────────────────────────

export const HITLRequestEvent = z.object({
  type: z.literal('hitl.request'),
  payload: z.object({
    requestId: z.string().uuid(),
    prompt: z.string(),
    options: z.array(z.string()).optional(),
    requiredBy: z.string().optional(),
    timeout: z.number().positive().optional(),
  }),
}).merge(BaseEventMetadata);

export const HITLResponseEvent = z.object({
  type: z.literal('hitl.response'),
  payload: z.object({
    requestId: z.string().uuid(),
    response: z.unknown(),
    respondedBy: z.string().optional(),
    approved: z.boolean(),
  }),
}).merge(BaseEventMetadata);

// ── Jules-specific Events ────────────────────────────────────────────────

export const JulesStatusEvent = z.object({
  type: z.literal('jules.status'),
  payload: z.object({
    status: z.enum(['idle', 'thinking', 'acting', 'waiting']),
    message: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
  }),
}).merge(BaseEventMetadata);

export const JulesEventEvent = z.object({
  type: z.literal('jules.event'),
  payload: z.object({
    eventType: z.string(),
    data: z.record(z.string(), z.unknown()),
  }),
}).merge(BaseEventMetadata);

// ── User Events ──────────────────────────────────────────────────────────

export const UserMessageEvent = z.object({
  type: z.literal('user.message'),
  payload: z.object({
    userId: z.string().optional(),
    message: z.string(),
    attachments: z.array(z.string()).optional(),
  }),
}).merge(BaseEventMetadata);

// ── Discriminated Union ──────────────────────────────────────────────────

export const SessionEvent = z.discriminatedUnion('type', [
  SystemStartEvent,
  SystemCompleteEvent,
  SystemErrorEvent,
  AgentThoughtEvent,
  AgentActionEvent,
  AgentResultEvent,
  HITLRequestEvent,
  HITLResponseEvent,
  JulesStatusEvent,
  JulesEventEvent,
  UserMessageEvent,
]);

export type SessionEvent = z.infer<typeof SessionEvent>;

// ── Type Guards ──────────────────────────────────────────────────────────

export function isSystemEvent(event: SessionEvent): event is z.infer<typeof SystemStartEvent | typeof SystemCompleteEvent | typeof SystemErrorEvent> {
  return event.type.startsWith('system.');
}

export function isAgentEvent(event: SessionEvent): event is z.infer<typeof AgentThoughtEvent | typeof AgentActionEvent | typeof AgentResultEvent> {
  return event.type.startsWith('agent.');
}

export function isHITLEvent(event: SessionEvent): event is z.infer<typeof HITLRequestEvent | typeof HITLResponseEvent> {
  return event.type.startsWith('hitl.');
}

export function isJulesEvent(event: SessionEvent): event is z.infer<typeof JulesStatusEvent | typeof JulesEventEvent> {
  return event.type.startsWith('jules.');
}

export function isUserEvent(event: SessionEvent): event is z.infer<typeof UserMessageEvent> {
  return event.type === 'user.message';
}

// ── Session Types ────────────────────────────────────────────────────────

export const SessionStatus = z.enum(['active', 'completed', 'error']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SubscriberType = z.enum(['agent', 'user', 'system']);
export type SubscriberType = z.infer<typeof SubscriberType>;

export const GranteeType = z.enum(['agent', 'user', 'system', 'wildcard']);
export type GranteeType = z.infer<typeof GranteeType>;

export const Permission = z.enum(['read', 'write', 'admin']);
export type Permission = z.infer<typeof Permission>;
