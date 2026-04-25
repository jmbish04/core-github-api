/**
 * @file routes/api/projects/sentinel/ws.ts
 * @description GET /ws — WebSocket upgrade endpoint for Sentinel orchestrator wake-ups.
 *
 * Forwards the WebSocket upgrade directly to JulesWebhookBroadcaster Agent, which
 * provides hibernatable WebSocket fan-out. All Sentinel task mutations (claim, update,
 * submit, ingest) broadcast events via the Agent's /internal/broadcast endpoint.
 *
 * Connection flow:
 *  1. Client connects: GET /api/projects/sentinel/ws  (with X-API-Key or ?key= auth)
 *  2. Worker validates auth, forwards upgrade to JulesWebhookBroadcaster Agent
 *  3. Client sends: {"type":"subscribe","projectId":"github:owner/repo"}
 *  4. Sentinel mutations post to /internal/broadcast — all subscribers receive events
 *
 * Supported event types received by subscribers:
 *  - task_claimed      — agent claimed a task
 *  - task_updated      — task status/notes changed
 *  - task_submitted    — task entered review, GUARDRAIL_AGENT dispatched
 *  - clarification_request — agent needs orchestrator input
 *  - insight_ingested  — LearningAgent detected a new pattern
 */

import { Hono } from 'hono';
import { getAgentByName } from 'agents';

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

    // Forward upgrade to JulesWebhookBroadcaster Agent — SDK handles WS handshake,
    // then calls getConnectionTags + onConnect. c.req.raw preserves the full URL.
    const agent = await getAgentByName(c.env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");
    return agent.fetch(req);
});

export default wsApi;
