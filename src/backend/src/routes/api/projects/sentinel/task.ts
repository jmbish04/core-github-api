/**
 * @file routes/api/projects/sentinel/task.ts
 * @description GET /tasks/:id — fetch a single task with story + epic hierarchy context.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks } from '@/db/schemas/projects/backlog/tasks';
import { stories } from '@/db/schemas/projects/backlog/stories';
import { epics } from '@/db/schemas/projects/backlog/epics';
import { eq } from 'drizzle-orm';
import { SentinelTaskWithContextSchema, ErrorResponseSchema } from './types';

const route = createRoute({
    method: 'get',
    path: '/tasks/:id',
    operationId: 'sentinelGetTask',
    summary: 'Get a single Sentinel task with hierarchy context',
    request: {
        params: z.object({ id: z.string() }),
    },
    responses: {
        200: {
            description: 'Task detail',
            content: { 'application/json': { schema: SentinelTaskWithContextSchema } },
        },
        404: {
            description: 'Task not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const taskApi = new OpenAPIHono<{ Bindings: Env }>();

taskApi.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const db = getDb(c.env.DB);

    const rows = await db
        .select({
            id: tasks.id,
            repoId: tasks.repoId,
            parentId: tasks.parentId,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            priority: tasks.priority,
            assignee: tasks.assignee,
            position: tasks.position,
            kanbanColumn: tasks.kanbanColumn,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            storyId: stories.id,
            storyTitle: stories.title,
            epicId: epics.id,
            epicTitle: epics.title,
        })
        .from(tasks)
        .leftJoin(stories, eq(tasks.parentId, stories.id))
        .leftJoin(epics, eq(stories.parentId, epics.id))
        .where(eq(tasks.id, id))
        .limit(1);

    const row = rows[0];
    if (!row) {
        return c.json({ ok: false, error: `Task '${id}' not found` } as any, 404);
    }

    return c.json({
        id: row.id,
        repoId: row.repoId,
        parentId: row.parentId,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        assignee: row.assignee,
        position: row.position,
        kanbanColumn: row.kanbanColumn,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        story: row.storyId ? { id: row.storyId, title: row.storyTitle ?? '' } : null,
        epic: row.epicId ? { id: row.epicId, title: row.epicTitle ?? '' } : null,
    } as any, 200);
});

export default taskApi;
