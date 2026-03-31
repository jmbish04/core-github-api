/**
 * @file routes/api/projects/sentinel/available.ts
 * @description GET /tasks/available — list unclaimed tasks for agent pickup.
 *
 * Returns tasks where assignee IS NULL and status='todo', ordered by position ASC.
 * Includes story and epic titles for context.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks } from '@/db/schemas/projects/backlog/tasks';
import { stories } from '@/db/schemas/projects/backlog/stories';
import { epics } from '@/db/schemas/projects/backlog/epics';
import { isNull, eq, asc, and } from 'drizzle-orm';
import { SentinelTaskWithContextSchema, TaskAvailableQuerySchema } from './types';

const ResponseSchema = z.object({
    tasks: z.array(SentinelTaskWithContextSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
});

const route = createRoute({
    method: 'get',
    path: '/tasks/available',
    operationId: 'sentinelListAvailableTasks',
    summary: 'List available (unclaimed) Sentinel tasks',
    description: 'Returns tasks with no assignee and status=todo. Used by agents to discover work.',
    request: {
        query: TaskAvailableQuerySchema,
    },
    responses: {
        200: {
            description: 'Available task list',
            content: { 'application/json': { schema: ResponseSchema } },
        },
    },
});

const availableApi = new OpenAPIHono<{ Bindings: Env }>();

availableApi.openapi(route, async (c) => {
    const { repoId, limit, offset } = c.req.valid('query');
    const db = getDb(c.env.DB);

    // Build the where clause dynamically
    const baseCondition = and(isNull(tasks.assignee), eq(tasks.status, 'todo'));
    const whereClause = repoId
        ? and(baseCondition, eq(tasks.repoId, repoId))
        : baseCondition;

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
        .where(whereClause)
        .orderBy(asc(tasks.position), asc(tasks.createdAt))
        .limit(limit)
        .offset(offset);

    const shaped = rows.map((r) => ({
        id: r.id,
        repoId: r.repoId,
        parentId: r.parentId,
        title: r.title,
        description: r.description,
        status: r.status,
        priority: r.priority,
        assignee: r.assignee,
        position: r.position,
        kanbanColumn: r.kanbanColumn,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        story: r.storyId ? { id: r.storyId, title: r.storyTitle ?? '' } : null,
        epic: r.epicId ? { id: r.epicId, title: r.epicTitle ?? '' } : null,
    }));

    return c.json({ tasks: shaped, total: shaped.length, limit, offset } as any, 200);
});

export default availableApi;
