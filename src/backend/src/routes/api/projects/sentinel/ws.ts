/**
 * @file routes/api/projects/sentinel/ws.ts
 * @description GET /ws — WebSocket upgrade endpoint for Sentinel orchestrator wake-ups.
 *
 * Forwards the WebSocket upgrade directly to JulesWebhookBroadcaster DO, which
 * provides hibernatable WebSocket fan-out. All Sentinel task mutations (claim, update,
 * submit, ingest) broadcast events via the DO's /internal/broadcast endpoint.
 *
 * Connection flow:
 *  1. Client connects: GET /api/projects/sentinel/ws  (with X-API-Key or ?key= auth)
 *  2. Worker validates auth, forwards upgrade to JulesWebhookBroadcaster DO
 *  3. Client sends: {"type":"subscribe","projectId":"github:owner/repo"}
 *  4. Sentinel mutations post to /internal/broadcast — all subscribers receive events
 *
 * Supported event types received by subscribers:
 *  - task_claimed      — agent claimed a task
 *  - task_updated      — task status/notes changed
 *  - task_submitted    — task entered review, JUDGE_AGENT dispatched
 *  - clarification_request — agent needs orchestrator input
 *  - insight_ingested  — LearningAgent detected a new pattern
 */

import { Hono } from 'hono';

const wsApi = new Hono<{ Bindings: Env }>();

wsApi.get('/ws', async (c) => {
    const req = c.req.raw;

    // Auth: X-API-Key header or ?key= query param
    const apiKey = req.headers.get('X-API-Key') ?? new URL(req.url).searchParams.get('key');
    const expectedKey =
        typeof c.env.AGENTIC_WORKER_API_KEY === 'string'
            ? c.env.AGENTIC_WORKER_API_KEY
            : await (c.env.AGENTIC_WORKER_API_KEY as any)?.get?.();

    if (!apiKey || apiKey !== expectedKey) {
        return c.text('Unauthorized — provide X-API-Key header or ?key= query param', 401);
    }

    // Validate WebSocket upgrade header
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return c.text('Expected WebSocket upgrade (Upgrade: websocket)', 426);
    }

    // Forward upgrade directly to JulesWebhookBroadcaster Durable Object.
    // The DO handles hibernatable WebSocket lifecycle — zero CPU cost when idle.
    const id = c.env.JULES_WEBHOOK_BROADCASTER.idFromName('jules-broadcaster');
    const stub = c.env.JULES_WEBHOOK_BROADCASTER.get(id);

    // Pass the original request so the DO receives the proper WS upgrade headers
    return stub.fetch(new Request('http://do/ws', {
        method: req.method,
        headers: req.headers,
        body: req.body,
    }));
});

export default wsApi;
