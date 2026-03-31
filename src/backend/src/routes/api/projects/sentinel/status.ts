/**
 * @file routes/api/projects/sentinel/status.ts
 * @description GET /status — Sentinel system status overview.
 *
 * Returns:
 *  - Task counts by status for the sentinel repo
 *  - Recent task events (last 10)
 *  - JULES_WEBHOOK_BROADCASTER connectivity
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { eq, count, desc, isNotNull } from 'drizzle-orm';

const StatusResponseSchema = z.object({
    healthy: z.boolean(),
    taskCounts: z.object({
        todo: z.number(),
        inProgress: z.number(),
        inReview: z.number(),
        done: z.number(),
        backlog: z.number(),
    }),
    activeClaims: z.number().describe('Tasks currently assigned to an agent'),
    recentEvents: z.array(
        z.object({
            id: z.string(),
            taskId: z.string().nullable(),
            eventType: z.string(),
            status: z.string(),
            timestamp: z.string().nullable(),
        }),
    ),
    broadcasterBound: z.boolean(),
    timestamp: z.string(),
});

const route = createRoute({
    method: 'get',
    path: '/status',
    operationId: 'sentinelGetStatus',
    summary: 'Sentinel system status',
    description: 'Returns task counts, active claims, recent events, and DO connectivity.',
    responses: {
        200: {
            description: 'Sentinel status',
            content: { 'application/json': { schema: StatusResponseSchema } },
        },
    },
});

const statusApi = new OpenAPIHono<{ Bindings: Env }>();

statusApi.openapi(route, async (c) => {
    const db = getDb(c.env.DB);

    // Task counts per status
    const statusCounts = await db
        .select({ status: tasks.status, cnt: count() })
        .from(tasks)
        .groupBy(tasks.status);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
        byStatus[row.status] = row.cnt;
    }

    // Active claims (tasks with assignee set)
    const [claimRow] = await db
        .select({ cnt: count() })
        .from(tasks)
        .where(isNotNull(tasks.assignee));

    // Recent events
    const recent = await db
        .select({
            id: taskEvents.id,
            taskId: taskEvents.taskId,
            eventType: taskEvents.eventType,
            status: taskEvents.status,
            timestamp: taskEvents.timestamp,
        })
        .from(taskEvents)
        .orderBy(desc(taskEvents.timestamp))
        .limit(10);

    // Check broadcaster binding
    const broadcasterBound = Boolean(c.env.JULES_WEBHOOK_BROADCASTER);

    return c.json({
        healthy: broadcasterBound,
        taskCounts: {
            todo: byStatus['todo'] ?? 0,
            inProgress: byStatus['in_progress'] ?? 0,
            inReview: byStatus['in_review'] ?? 0,
            done: byStatus['done'] ?? 0,
            backlog: byStatus['backlog'] ?? 0,
        },
        activeClaims: claimRow?.cnt ?? 0,
        recentEvents: recent,
        broadcasterBound,
        timestamp: new Date().toISOString(),
    } as any, 200);
});

export default statusApi;
