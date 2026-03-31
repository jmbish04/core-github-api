/**
 * @file routes/api/projects/sentinel/submit.ts
 * @description POST /tasks/:id/submit — marks task in_review, dispatches JUDGE_AGENT.
 *
 * Side effects:
 *  - Updates task status → in_review, kanbanColumn → in_review
 *  - Inserts task_events audit record
 *  - Dispatches JUDGE_AGENT binding with task context
 *  - Broadcasts { type: 'task_submitted' } via JulesWebhookBroadcaster
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { eq } from 'drizzle-orm';
import { generateUuid } from '@/utils/common';
import {
    SubmitTaskBodySchema,
    OkResponseSchema,
    ErrorResponseSchema,
    broadcastSentinelEvent,
} from './types';

const route = createRoute({
    method: 'post',
    path: '/tasks/:id/submit',
    operationId: 'sentinelSubmitTask',
    summary: 'Submit a Sentinel task for review',
    description: 'Moves task to in_review and dispatches the JUDGE_AGENT binding for automated verification.',
    request: {
        params: z.object({ id: z.string() }),
        body: { content: { 'application/json': { schema: SubmitTaskBodySchema } } },
    },
    responses: {
        200: {
            description: 'Task submitted for review',
            content: { 'application/json': { schema: OkResponseSchema } },
        },
        404: {
            description: 'Task not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

const submitApi = new OpenAPIHono<{ Bindings: Env }>();

submitApi.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const { notes } = c.req.valid('json');
    const db = getDb(c.env.DB);

    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const task = existing[0];
    if (!task) {
        return c.json({ ok: false, error: `Task '${id}' not found` } as any, 404);
    }

    const now = new Date().toISOString();

    // Transition to in_review
    await db.update(tasks)
        .set({ status: 'in_review' as any, kanbanColumn: 'in_review', updatedAt: now })
        .where(eq(tasks.id, id));

    // Audit event
    await db.insert(taskEvents).values({
        id: generateUuid(),
        taskId: id,
        eventType: 'submitted',
        objectType: 'task',
        fieldName: 'status',
        oldValue: task.status,
        newValue: 'in_review',
        status: 'in_review',
        details: JSON.stringify({ notes: notes ?? null, submittedAt: now }),
        timestamp: now,
    });

    // Dispatch JUDGE_AGENT for automated verification
    try {
        if (c.env.JUDGE_AGENT) {
            await (c.env.JUDGE_AGENT as any).fetch(
                new Request('http://judge/task', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: id,
                        repoId: task.repoId,
                        assignee: task.assignee,
                        title: task.title,
                        notes: notes ?? null,
                    }),
                }),
            );
        }
    } catch {
        // JUDGE_AGENT dispatch failure is non-fatal — task is already in_review
    }

    // Broadcast wake-up signal to orchestrators
    await broadcastSentinelEvent(c.env, {
        type: 'task_submitted',
        taskId: id,
        repoId: task.repoId,
        assignee: task.assignee,
        timestamp: now,
    });

    return c.json({ ok: true, message: `Task '${id}' submitted for review` } as any, 200);
});

export default submitApi;
