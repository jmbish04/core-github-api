/**
 * @file backend/src/routes/api/projects/sentinel/clarify.ts
 * @description POST /api/projects/sentinel/tasks/:taskId/clarify
 *
 * Accepts a clarification question for a Sentinel task, broadcasts it via
 * JulesWebhookBroadcaster, and notifies JulesOverseer for AI-assisted answering.
 */

import { Hono } from 'hono';

const clarifyRouter = new Hono<{ Bindings: Env }>();

clarifyRouter.post('/tasks/:taskId/clarify', async (c) => {
  const taskId = c.req.param('taskId');
  let body: { question?: string; projectId?: string; agentId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.question || typeof body.question !== 'string') {
    return c.json({ error: 'question field is required' }, 400);
  }

  const env = c.env;

  // 1. Broadcast to JulesWebhookBroadcaster (real-time WS fan-out)
  try {
    const broadcasterId = env.JULES_WEBHOOK_BROADCASTER.idFromName('jules-broadcaster');
    const broadcaster = env.JULES_WEBHOOK_BROADCASTER.get(broadcasterId);
    await broadcaster.fetch('http://internal/internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clarification_request',
        taskId,
        sessionId: taskId,
        projectId: body.projectId,
        question: body.question,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.error('[clarify] Failed to broadcast to JulesWebhookBroadcaster:', err.message);
  }

  // 2. Notify JulesOverseer for AI-assisted answering (non-blocking)
  try {
    const overseerStubId = env.JULES_OVERSEER.idFromName('jules-overseer');
    const overseerStub = env.JULES_OVERSEER.get(overseerStubId);
    await overseerStub.fetch('http://internal/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clarification_request',
        sessionId: taskId,
        taskId,
        question: body.question,
        projectId: body.projectId,
        agentId: body.agentId,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    // Non-fatal: log but don't fail the main response
    console.error('[clarify] Failed to notify JulesOverseer:', err.message);
  }

  return c.json({
    ok: true,
    taskId,
    message: 'Clarification request received. AI response will be broadcast via WebSocket.',
  });
});

export default clarifyRouter;
