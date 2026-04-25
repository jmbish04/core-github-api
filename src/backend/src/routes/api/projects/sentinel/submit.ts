/**
 * @file routes/api/projects/sentinel/submit.ts
 * @description POST /tasks/:id/submit — marks task in_review, dispatches GUARDRAIL_AGENT.
 *
 * Side effects:
 *  - Updates task status → in_review, kanbanColumn → in_review
 *  - Inserts task_events audit record
 *  - Dispatches GUARDRAIL_AGENT binding with task context
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
} from './types';
import { broadcastSentinelEvent } from './broadcast';
import { Logger } from '@/lib/logger';

const route = createRoute({
    method: 'post',
    path: '/tasks/:id/submit',
    operationId: 'sentinelSubmitTask',
    summary: 'Submit a Sentinel task for review',
    description: 'Moves task to in_review and dispatches the GUARDRAIL_AGENT binding for automated verification.',
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
    const logger = new Logger(c.env as any, 'SentinelSubmit');
    const logPrefix = `[${route.operationId}] `;
    logger.info(`${logPrefix}Received request to submit task ${id}`);

    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const task = existing[0];

    logger.info(`${logPrefix}Found task: ${JSON.stringify(task)}`);
    if (!task) {
        logger.error(`${logPrefix}Task '${id}' not found`);
        return c.json({ ok: false, error: `Task '${id}' not found` } as any, 404);
    }

    const now = new Date().toISOString();

    // Transition to in_review
    await db.update(tasks)
        .set({ status: 'in_review' as any, kanbanColumn: 'in_review', updatedAt: now })
        .where(eq(tasks.id, id));
    logger.info(`${logPrefix}Updated task ${id} to in_review`);

    // Audit event
    const auditEvent = {
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
    };

    await db.insert(taskEvents).values(auditEvent);
    logger.info(`${logPrefix}Created task auditEvent for task ${id}; ${JSON.stringify(auditEvent)}`);

    // Dispatch GUARDRAIL_AGENT for automated verification
    try {
        logger.info(`${logPrefix}Dispatching GUARDRAIL_AGENT for task ${id}`);
        if (c.env.GUARDRAIL_AGENT) {
            const { getAgentByName } = await import('agents');
            const agent = await getAgentByName(c.env.GUARDRAIL_AGENT as any, 'sentinel-singleton');
            const judgeTaskPayload = {
                taskId: id,
                repoId: task.repoId,
                assignee: task.assignee,
                title: task.title,
                notes: notes ?? null,
            };

            await (agent as any).judgeTask(judgeTaskPayload);
            logger.info(`${logPrefix}Dispatched GUARDRAIL_AGENT for task ${id}; ${JSON.stringify(judgeTaskPayload)}`);
        }
    } catch (err) {
        // GUARDRAIL_AGENT dispatch failure is non-fatal — task is already in_review
        logger.error(`${logPrefix}Failed to dispatch GUARDRAIL_AGENT for task ${id}; ${JSON.stringify(err)}`);
    }

    // Broadcast wake-up signal to orchestrators
    const broadcastPayload = {
        type: 'task_submitted',
        taskId: id,
        repoId: task.repoId,
        assignee: task.assignee,
        timestamp: now,
    };

    await broadcastSentinelEvent(c.env, broadcastPayload);
    logger.info(`${logPrefix}Broadcasted task_submitted event for task ${id}; ${JSON.stringify(broadcastPayload)}`);

    const response = {
        ok: true,
        message: `Task '${id}' submitted for review`,
        data: {
            task: task,
            auditEvent: auditEvent,
            broadcastPayload: broadcastPayload,
        },
    };
    logger.info(`${logPrefix}Response: ${JSON.stringify(response)}`);
    return c.json(response as any, 200);
});

export default submitApi;
