/**
 * @file routes/api/projects/sentinel/claim.ts
 * @description POST /tasks/:id/claim — agent claims a task, sets assignee + transitions to in_progress.
 *
 * Side effects:
 *  - Updates tasks.assignee, tasks.status, tasks.kanban_column
 *  - Inserts a task_events audit record
 *  - Broadcasts { type: 'task_claimed' } via JulesWebhookBroadcaster
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { eq, isNull, and } from 'drizzle-orm';
import { generateUuid } from '@/utils/common';
import {
    ClaimTaskBodySchema,
    SentinelTaskSchema,
    ErrorResponseSchema,
    broadcastSentinelEvent,
} from './types';

const ResponseSchema = z.object({
    ok: z.literal(true),
    task: SentinelTaskSchema,
});

const route = createRoute({
    method: 'post',
    path: '/tasks/:id/claim',
    operationId: 'sentinelClaimTask',
    summary: 'Claim a Sentinel task',
    description: 'Sets the assignee on an unclaimed task and moves it to in_progress.',
    request: {
        params: z.object({ id: z.string() }),
        body: { content: { 'application/json': { schema: ClaimTaskBodySchema } } },
    },
    responses: {
        200: {
            description: 'Task claimed',
            content: { 'application/json': { schema: ResponseSchema } },
        },
        404: {
            description: 'Task not found or already claimed',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        409: {
            description: 'Task already assigned',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const claimApi = new OpenAPIHono<{ Bindings: Env }>();

claimApi.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const { assignee } = c.req.valid('json');
    const db = getDb(c.env.DB);

    // Verify task exists and is unassigned
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const task = existing[0];
    if (!task) {
        return c.json({ ok: false, error: `Task '${id}' not found` } as any, 404);
    }
    if (task.assignee) {
        return c.json({ ok: false, error: `Task '${id}' is already claimed by '${task.assignee}'` } as any, 409);
    }

    const now = new Date().toISOString();

    // Update task
    await db.update(tasks)
        .set({
            assignee,
            status: 'in_progress',
            kanbanColumn: 'in_progress',
            updatedAt: now,
        })
        .where(and(eq(tasks.id, id), isNull(tasks.assignee)));

    // Insert audit event
    await db.insert(taskEvents).values({
        id: generateUuid(),
        taskId: id,
        eventType: 'claimed',
        objectType: 'task',
        fieldName: 'assignee',
        oldValue: null,
        newValue: assignee,
        status: 'in_progress',
        details: JSON.stringify({ claimedAt: now }),
        timestamp: now,
    });

    // Fetch updated task
    const updated = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

    // Broadcast to WebSocket subscribers
    await broadcastSentinelEvent(c.env, {
        type: 'task_claimed',
        taskId: id,
        assignee,
        repoId: task.repoId,
        timestamp: now,
    });

    return c.json({ ok: true, task: updated[0] } as any, 200);
});

export default claimApi;
