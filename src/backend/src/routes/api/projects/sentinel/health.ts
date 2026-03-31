/**
 * @file routes/api/projects/sentinel/health.ts
 * @description Sentinel health check.
 *
 * Exports two things:
 *  1. `checkHealth(env)` — registered in HealthCoordinator.CODE_CHECKS under category 'sentinel'
 *  2. Default Hono sub-app with GET /health for direct HTTP access
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { tasks } from '@/db/schemas/projects/backlog/tasks';
import { count } from 'drizzle-orm';
import type { HealthStepResult } from '@/health/types';

// ─── Core health check function (registered in HealthCoordinator) ─────────────

export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const details: Record<string, unknown> = {};
    const errors: string[] = [];

    // 1. D1 tasks table — query total tasks for sentinel repo
    try {
        const db = getDb(env.DB);
        const [row] = await db
            .select({ total: count() })
            .from(tasks);
        details.tasksTableAccessible = true;
        details.totalTasksInDb = row?.total ?? 0;
    } catch (err: unknown) {
        errors.push(`tasks table: ${err instanceof Error ? err.message : String(err)}`);
        details.tasksTableAccessible = false;
    }

    // 2. JulesWebhookBroadcaster binding
    try {
        if (env.JULES_WEBHOOK_BROADCASTER) {
            details.julesWebhookBroadcasterBound = true;
        } else {
            errors.push('JULES_WEBHOOK_BROADCASTER binding missing');
            details.julesWebhookBroadcasterBound = false;
        }
    } catch {
        errors.push('JULES_WEBHOOK_BROADCASTER binding error');
        details.julesWebhookBroadcasterBound = false;
    }

    // 3. Auth secrets
    const agentKeyOk = Boolean(env.AGENTIC_WORKER_API_KEY);
    const workerKeyOk = Boolean(env.WORKER_API_KEY);
    details.agenticWorkerApiKeySet = agentKeyOk;
    details.workerApiKeySet = workerKeyOk;
    if (!agentKeyOk) errors.push('AGENTIC_WORKER_API_KEY not set');

    const healthy = errors.length === 0;

    return {
        name: 'Sentinel',
        status: healthy ? 'success' : 'failure',
        message: healthy
            ? 'Sentinel API healthy — D1 tasks accessible, DO bound, auth keys present'
            : `Sentinel degraded: ${errors.join('; ')}`,
        durationMs: Date.now() - start,
        details,
    };
}

// ─── HTTP route (GET /health) ─────────────────────────────────────────────────

const HealthResponseSchema = z.object({
    name: z.string(),
    status: z.enum(['success', 'failure']),
    message: z.string(),
    durationMs: z.number(),
    details: z.record(z.string(), z.unknown()).optional(),
});

const healthRoute = createRoute({
    method: 'get',
    path: '/health',
    operationId: 'getSentinelHealth',
    summary: 'Sentinel health check',
    description: 'Returns the health status of the Sentinel API: D1 connectivity, WebSocket broadcaster binding, and auth key presence.',
    responses: {
        200: {
            description: 'Sentinel health status',
            content: { 'application/json': { schema: HealthResponseSchema } },
        },
    },
});

const sentinelHealthApi = new OpenAPIHono<{ Bindings: Env }>();

sentinelHealthApi.openapi(healthRoute, async (c) => {
    const result = await checkHealth(c.env);
    return c.json(result as any, 200);
});

export default sentinelHealthApi;
