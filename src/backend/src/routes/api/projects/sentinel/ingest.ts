/**
 * @file routes/api/projects/sentinel/ingest.ts
 * @description POST /ingest — ingest an insight from LearningAgent or external analyst.
 *
 * Stores the insight as a taskEvent on a sentinel meta-task OR directly if
 * the learning_ai_insights table exists. Broadcasts the insight via WebSocket
 * so orchestrators can react in real-time.
 *
 * This is the primary entry point for the Contemplation Gate feed.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { generateUuid } from '@/utils/common';
import {
    IngestInsightBodySchema,
    OkResponseSchema,
    ErrorResponseSchema,
    broadcastSentinelEvent,
} from './types';

const ResponseSchema = OkResponseSchema.extend({
    insightId: z.string(),
});

const route = createRoute({
    method: 'post',
    path: '/ingest',
    operationId: 'sentinelIngestInsight',
    summary: 'Ingest a Sentinel insight',
    description: 'Receives a detected pattern from LearningAgent. Logs to D1 and broadcasts via WebSocket for real-time orchestrator awareness.',
    request: {
        body: { content: { 'application/json': { schema: IngestInsightBodySchema } } },
    },
    responses: {
        200: {
            description: 'Insight ingested',
            content: { 'application/json': { schema: ResponseSchema } },
        },
        500: {
            description: 'Ingestion failed',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const ingestApi = new OpenAPIHono<{ Bindings: Env }>();

ingestApi.openapi(route, async (c) => {
    const body = c.req.valid('json');
    const db = getDb(c.env.DB);
    const insightId = generateUuid();
    const now = new Date().toISOString();

    try {
        // Phase 1: Log as a taskEvent (works before learning_ai_insights table exists)
        // Uses a sentinel meta-task placeholder taskId — allows full audit trail in existing schema.
        await db.insert(taskEvents).values({
            id: insightId,
            taskId: null, // insight not bound to a specific task
            eventType: 'insight_ingested',
            objectType: 'sentinel_insight',
            fieldName: body.patternType,
            oldValue: null,
            newValue: body.description,
            status: body.severity,
            details: JSON.stringify({
                repoId: body.repoId,
                patternType: body.patternType,
                severity: body.severity,
                sourceSessionId: body.sourceSessionId ?? null,
                context: body.context ?? null,
                ingestedAt: now,
            }),
            timestamp: now,
        });
    } catch (err: unknown) {
        return c.json(
            { ok: false, error: `Insight storage failed: ${err instanceof Error ? err.message : String(err)}` } as any,
            500,
        );
    }

    // Broadcast to orchestrators — enables real-time Contemplation Gate reactions
    await broadcastSentinelEvent(c.env, {
        type: 'insight_ingested',
        insightId,
        repoId: body.repoId,
        patternType: body.patternType,
        severity: body.severity,
        description: body.description,
        sourceSessionId: body.sourceSessionId ?? null,
        timestamp: now,
    });

    return c.json({ ok: true, insightId, message: 'Insight ingested and broadcast' } as any, 200);
});

export default ingestApi;
