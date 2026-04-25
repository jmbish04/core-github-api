/**
 * @file routes/api/projects/sentinel/index.ts
 * @description Sentinel API router — assembles all sub-routers under a single
 * OpenAPIHono instance with shared auth middleware.
 *
 * Mounted at /api/projects/sentinel in src/backend/src/routes/index.ts.
 *
 * Protocol support:
 *  REST     — All endpoints below via standard HTTP
 *  WebSocket — GET /ws forwards to JulesWebhookBroadcaster DO for hibernatable fan-out
 *  MCP      — Tools registered via registerSentinelMcpTools() in ai/mcp/index.ts,
 *             accessible via the existing POST /mcp endpoint
 *
 * Route summary (relative to mount point):
 *  GET  /tasks/available      — list unclaimed tasks
 *  GET  /tasks/:id            — task detail with story+epic context
 *  POST /tasks                — create a new task
 *  POST /tasks/:id/claim      — agent claims a task
 *  PATCH /tasks/:id           — update status/notes
 *  POST /tasks/:id/submit     — submit for review, dispatch GUARDRAIL_AGENT
 *  POST /tasks/:id/clarify    — broadcast clarification request to orchestrators
 *  GET  /status               — system status (task counts, recent events)
 *  POST /ingest               — ingest an insight from LearningAgent
 *  GET  /ws                   — WebSocket upgrade (→ JulesWebhookBroadcaster DO)
 *  GET  /health               — health check (also registered in HealthCoordinator)
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import availableApi from './available';
import taskApi from './task';
import createApi from './create';
import claimApi from './claim';
import updateApi from './update';
import submitApi from './submit';
import clarifyApi from './clarify';
import statusApi from './status';
import ingestApi from './ingest';
import wsApi from './ws';
import sentinelHealthApi from './health';

const sentinelApi = new OpenAPIHono<{ Bindings: Env }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
// All routes require AGENTIC_WORKER_API_KEY or WORKER_API_KEY.
// The WebSocket endpoint (/ws) performs its own auth before forwarding to the DO.

sentinelApi.use('*', async (c, next) => {
    // Skip auth for the health endpoint — allows monitoring without credentials
    if (c.req.path.endsWith('/health')) {
        return next();
    }

    // WebSocket upgrade handled separately (auth in ws.ts before DO forward)
    if (c.req.path.endsWith('/ws') && c.req.header('Upgrade')?.toLowerCase() === 'websocket') {
        return next();
    }

    const authHeader = c.req.header('Authorization');
    const apiKeyHeader = c.req.header('X-API-Key');
    const token = authHeader?.replace(/^Bearer\s+/i, '') ?? apiKeyHeader ?? '';

    const agentKey =
        typeof c.env.AGENTIC_WORKER_API_KEY === 'string'
            ? c.env.AGENTIC_WORKER_API_KEY
            : await (c.env.AGENTIC_WORKER_API_KEY as any)?.get?.() ?? '';

    const workerKey =
        typeof c.env.WORKER_API_KEY === 'string'
            ? c.env.WORKER_API_KEY
            : await (c.env.WORKER_API_KEY as any)?.get?.() ?? '';

    if (!token || (token !== agentKey && token !== workerKey)) {
        return c.json({ ok: false, error: 'Unauthorized — provide Authorization: Bearer <AGENTIC_WORKER_API_KEY>' }, 401);
    }

    return next();
});

// ─── Route Mounts ─────────────────────────────────────────────────────────────

sentinelApi
    .route('/', availableApi)   // GET  /tasks/available
    .route('/', taskApi)        // GET  /tasks/:id
    .route('/', createApi)      // POST /tasks
    .route('/', claimApi)       // POST /tasks/:id/claim
    .route('/', updateApi)      // PATCH /tasks/:id
    .route('/', submitApi)      // POST /tasks/:id/submit
    .route('/', clarifyApi)     // POST /tasks/:id/clarify
    .route('/', statusApi)      // GET  /status
    .route('/', ingestApi)      // POST /ingest
    .route('/', wsApi)          // GET  /ws
    .route('/', sentinelHealthApi); // GET /health

export default sentinelApi;
