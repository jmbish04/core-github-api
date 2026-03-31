/**
 * @file routes/api/projects/sentinel/clarify.ts
 * @description POST /tasks/:id/clarify — agent asks a clarification question.
 *
 * Broadcasts a clarification_request event via JulesWebhookBroadcaster.
 * The JulesOverseer orchestrator listens for this and broadcasts a clarification_response.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { eq } from 'drizzle-orm';
import { generateUuid } from '@/utils/common';
import {
    ClarifyTaskBodySchema,
    OkResponseSchema,
    ErrorResponseSchema,
    broadcastSentinelEvent,
} from './types';

const route = createRoute({
    method: 'post',
    path: '/tasks/:id/clarify',
    operationId: 'sentinelClarifyTask',
    summary: 'Request clarification on a Sentinel task',
    description: 'Broadcasts a clarification_request event. JulesOverseer will respond via WebSocket broadcast.',
    request: {
        params: z.object({ id: z.string() }),
        body: { content: { 'application/json': { schema: ClarifyTaskBodySchema } } },
    },
    responses: {
        200: {
            description: 'Clarification request broadcast',
            content: { 'application/json': { schema: OkResponseSchema } },
        },
        404: {
            description: 'Task not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const clarifyApi = new OpenAPIHono<{ Bindings: Env }>();

clarifyApi.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const { question } = c.req.valid('json');
    const db = getDb(c.env.DB);

    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const task = existing[0];
    if (!task) {
        return c.json({ ok: false, error: `Task '${id}' not found` } as any, 404);
    }

    const now = new Date().toISOString();

    // Log clarification request as a task event
    await db.insert(taskEvents).values({
        id: generateUuid(),
        taskId: id,
        eventType: 'clarification_request',
        objectType: 'task',
        fieldName: null,
        oldValue: null,
        newValue: question,
        status: task.status,
        details: JSON.stringify({ question, askedAt: now, askedBy: task.assignee }),
        timestamp: now,
    });

    // Broadcast to orchestrators — JulesOverseer listens and will answer
    await broadcastSentinelEvent(c.env, {
        type: 'clarification_request',
        taskId: id,
        repoId: task.repoId,
        assignee: task.assignee,
        question,
        timestamp: now,
    });

    return c.json({
        ok: true,
        message: 'Clarification request broadcast — JulesOverseer will respond via WebSocket',
    } as any, 200);
});

export default clarifyApi;
