/**
 * @file routes/api/projects/sentinel/types.ts
 * @description Shared Zod schemas and TypeScript types for the Sentinel API.
 *
 * All endpoint files import from here — single source of truth for request/response shapes.
 */

import { z } from 'zod';

// ─── Task Shapes ─────────────────────────────────────────────────────────────

export const SentinelTaskSchema = z.object({
    id: z.string(),
    repoId: z.string(),
    parentId: z.string().nullable().optional(),
    title: z.string(),
    description: z.string().nullable().optional(),
    status: z.string(),
    priority: z.string(),
    assignee: z.string().nullable().optional(),
    position: z.number().nullable().optional(),
    kanbanColumn: z.string(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
});

export type SentinelTask = z.infer<typeof SentinelTaskSchema>;

export const SentinelTaskWithContextSchema = SentinelTaskSchema.extend({
    story: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
    epic: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
});

export type SentinelTaskWithContext = z.infer<typeof SentinelTaskWithContextSchema>;

// ─── Query Params ─────────────────────────────────────────────────────────────

export const TaskAvailableQuerySchema = z.object({
    repoId: z.string().optional(),
    limit: z.coerce.number().default(20),
    offset: z.coerce.number().default(0),
});

// ─── Request Bodies ───────────────────────────────────────────────────────────

export const ClaimTaskBodySchema = z.object({
    assignee: z.string().min(1, 'Assignee is required (e.g. jules:session-abc123)'),
});

export const UpdateTaskBodySchema = z.object({
    status: z.enum(['todo', 'in_progress', 'done', 'backlog', 'cancelled']).optional(),
    notes: z.string().optional(),
    kanbanColumn: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done']).optional(),
    description: z.string().optional(),
});

export const SubmitTaskBodySchema = z.object({
    notes: z.string().optional(),
});

export const ClarifyTaskBodySchema = z.object({
    question: z.string().min(1, 'Question is required'),
});

export const IngestInsightBodySchema = z.object({
    repoId: z.string(),
    patternType: z.string().describe('E.g. doom_loop, apology_cycle, schema_drift'),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    sourceSessionId: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
});

// ─── WebSocket Message Types ──────────────────────────────────────────────────

export const WsSubscribeMessageSchema = z.object({
    type: z.literal('subscribe'),
    projectId: z.string(),
});

export const WsPingMessageSchema = z.object({
    type: z.literal('ping'),
});

export const WsSystemOverrideMessageSchema = z.object({
    type: z.literal('system_override'),
    sessionId: z.string(),
    message: z.string(),
});

export const WsMessageSchema = z.discriminatedUnion('type', [
    WsSubscribeMessageSchema,
    WsPingMessageSchema,
    WsSystemOverrideMessageSchema,
]);

export type WsMessage = z.infer<typeof WsMessageSchema>;

// ─── Response Shapes ──────────────────────────────────────────────────────────

export const OkResponseSchema = z.object({
    ok: z.boolean(),
    message: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
    ok: z.literal(false),
    error: z.string(),
});

// ─── Broadcast Helper ─────────────────────────────────────────────────────────

/**
 * Posts a JSON payload to JulesWebhookBroadcaster for fan-out to all WS subscribers.
 * Used by claim, update, submit, clarify, and ingest handlers.
 */
export async function broadcastSentinelEvent(env: Env, payload: Record<string, unknown>): Promise<void> {
    try {
        const id = env.JULES_WEBHOOK_BROADCASTER.idFromName('jules-broadcaster');
        const stub = env.JULES_WEBHOOK_BROADCASTER.get(id);
        await stub.fetch(
            new Request('http://do/internal/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'sentinel', ...payload }),
            }),
        );
    } catch {
        // Non-fatal — broadcast failure should not block task mutation response
    }
}
