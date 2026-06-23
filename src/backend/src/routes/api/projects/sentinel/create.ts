/**
 * @file routes/api/projects/sentinel/create.ts
 * @description POST /tasks — create a new tracker task.
 *
 * Side effects:
 *  - Inserts a new task row
 *  - Inserts a task_events 'created' audit record
 *  - Broadcasts { type: 'task_created' } via JulesWebhookBroadcaster
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { generateUuid } from '@/utils/common';
import {
    CreateTrackerItemSchema,
    TrackerItemSchema,
    ErrorResponseSchema,
} from './types';
import { broadcastSentinelEvent } from './broadcast';

const ResponseSchema = z.object({
    ok: z.literal(true),
    task: TrackerItemSchema,
});

const route = createRoute({
    method: 'post',
    path: '/tasks',
    operationId: 'sentinelCreateTask',
    summary: 'Create a new Sentinel task',
    description: 'Creates a task with title, type, status, label, priority, and optional description.',
    request: {
        body: { content: { 'application/json': { schema: CreateTrackerItemSchema } } },
    },
    responses: {
        201: {
            description: 'Task created',
            content: { 'application/json': { schema: ResponseSchema } },
        },
        400: {
            description: 'Validation error',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const createApi = new OpenAPIHono<{ Bindings: Env }>();

createApi.openapi(route, async (c) => {
    const body = c.req.valid('json');
    const db = getDb(c.env.DB);

    const now = new Date().toISOString();
    const id = generateUuid();

    // Map status → kanbanColumn (they mirror each other)
    const kanbanColumn = body.status === 'cancelled' ? 'backlog' : body.status;

    await db.insert(tasks).values({
        id,
        repoId: 'default',
        title: body.title,
        description: body.description || null,
        status: body.status,
        priority: body.priority,
        kanbanColumn,
        createdAt: now,
        updatedAt: now,
    });

    // Audit event
    await db.insert(taskEvents).values({
        id: generateUuid(),
        taskId: id,
        eventType: 'created',
        objectType: 'task',
        status: body.status,
        details: JSON.stringify({
            type: body.type,
            label: body.label,
            createdAt: now,
        }),
        timestamp: now,
    });

    await broadcastSentinelEvent(c.env, {
        type: 'task_created',
        taskId: id,
        timestamp: now,
    });

    return c.json({
        ok: true,
        task: {
            id,
            type: body.type,
            title: body.title,
            status: body.status,
            label: body.label,
            priority: body.priority,
            parentId: null,
            assignee: null,
            description: body.description,
            createdAt: now,
        },
    } as any, 201);
});

export default createApi;
