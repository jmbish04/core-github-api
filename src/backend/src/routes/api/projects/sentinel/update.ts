/**
 * @file routes/api/projects/sentinel/update.ts
 * @description PATCH /tasks/:id — update task status, notes, kanbanColumn.
 *
 * Side effects:
 *  - Updates changed fields on the tasks row
 *  - Inserts one task_events record per changed field
 *  - Broadcasts { type: 'task_updated' } via JulesWebhookBroadcaster
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { eq } from 'drizzle-orm';
import { generateUuid } from '@/utils/common';
import {
    UpdateTaskBodySchema,
    SentinelTaskSchema,
    ErrorResponseSchema,
} from './types';
import { broadcastSentinelEvent } from './broadcast';

const ResponseSchema = z.object({
    ok: z.literal(true),
    task: SentinelTaskSchema,
});

const route = createRoute({
    method: 'patch',
    path: '/tasks/:id',
    operationId: 'sentinelUpdateTask',
    summary: 'Update a Sentinel task',
    description: 'Partial update for status, notes (description), or kanbanColumn. Emits audit events for each changed field.',
    request: {
        params: z.object({ id: z.string() }),
        body: { content: { 'application/json': { schema: UpdateTaskBodySchema } } },
    },
    responses: {
        200: {
            description: 'Task updated',
            content: { 'application/json': { schema: ResponseSchema } },
        },
        404: {
            description: 'Task not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const updateApi = new OpenAPIHono<{ Bindings: Env }>();

updateApi.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const db = getDb(c.env.DB);

    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const task = existing[0];
    if (!task) {
        return c.json({ ok: false, error: `Task '${id}' not found` } as any, 404);
    }

    const now = new Date().toISOString();
    const changes: Record<string, unknown> = {};
    const setClause: Record<string, unknown> = { updatedAt: now };

    // Track changed fields
    if (body.status !== undefined && body.status !== task.status) {
        changes.status = { from: task.status, to: body.status };
        setClause.status = body.status;
        // Auto-sync kanban column to status if not explicitly overridden
        if (!body.kanbanColumn) {
            setClause.kanbanColumn = body.status;
        }
    }
    if (body.kanbanColumn !== undefined && body.kanbanColumn !== task.kanbanColumn) {
        changes.kanbanColumn = { from: task.kanbanColumn, to: body.kanbanColumn };
        setClause.kanbanColumn = body.kanbanColumn;
    }
    if (body.notes !== undefined) {
        changes.description = { from: task.description, to: body.notes };
        setClause.description = body.notes;
    }
    if (body.description !== undefined) {
        changes.description = { from: task.description, to: body.description };
        setClause.description = body.description;
    }
    if (body.title !== undefined && body.title !== task.title) {
        changes.title = { from: task.title, to: body.title };
        setClause.title = body.title;
    }
    if (body.priority !== undefined && body.priority !== task.priority) {
        changes.priority = { from: task.priority, to: body.priority };
        setClause.priority = body.priority;
    }

    if (Object.keys(changes).length > 0) {
        await db.update(tasks).set(setClause as any).where(eq(tasks.id, id));

        // One audit event per changed field
        const events = Object.entries(changes).map(([field, diff]) => ({
            id: generateUuid(),
            taskId: id,
            eventType: 'updated',
            objectType: 'task',
            fieldName: field,
            oldValue: String((diff as any).from ?? ''),
            newValue: String((diff as any).to ?? ''),
            status: (setClause.status as string) ?? task.status,
            details: JSON.stringify({ updatedAt: now }),
            timestamp: now,
        }));

        for (const event of events) {
            await db.insert(taskEvents).values(event);
        }
    }

    const updated = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

    await broadcastSentinelEvent(c.env, {
        type: 'task_updated',
        taskId: id,
        repoId: task.repoId,
        changes,
        timestamp: now,
    });

    return c.json({ ok: true, task: updated[0] } as any, 200);
});

export default updateApi;
