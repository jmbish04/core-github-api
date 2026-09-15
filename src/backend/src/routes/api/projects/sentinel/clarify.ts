/**
 * @file backend/src/routes/api/projects/sentinel/clarify.ts
 * @description POST /api/projects/sentinel/tasks/:taskId/clarify
 *
 * Accepts a clarification question for a Sentinel task, broadcasts it via
 * JulesWebhookBroadcaster Agent, and notifies JulesOverseer for AI-assisted answering.
 */

import { Hono } from 'hono';
import { getAgentByName } from 'agents';
import { Logger } from '@/lib/logger';

const clarifyRouter = new Hono<{ Bindings: Env }>();

clarifyRouter.post('/tasks/:taskId/clarify', async (c) => {
  const logger = new Logger(c.env, 'ClarifyRouter');
  const logPrefix = "[ClarifyRouter - /tasks/:taskId/clarify] ";
  logger.info(`${logPrefix} Received request for task: ${c.req.param('taskId')}`);
  const taskId = c.req.param('taskId');
  let body: { question?: string; projectId?: string; agentId?: string };
  try {
    body = await c.req.json();
  } catch (error) {
    logger.error(`${logPrefix} Invalid JSON body`, { error: String(error) });
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.question || typeof body.question !== 'string') {

    logger.error(`${logPrefix} question field is required`);
    return c.json({ error: 'question field is required' }, 400);
  }

  const env = c.env;

  // 1. Broadcast to JulesWebhookBroadcaster Agent (real-time WS fan-out)
  try {
    const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");
    const broadcastEventObj = {
      type: 'clarification_request',
      taskId,
      sessionId: taskId,
      projectId: body.projectId,
      question: body.question,
      timestamp: new Date().toISOString(),
    };
    logger.info(`${logPrefix} Broadcasting event: ${JSON.stringify(broadcastEventObj)}`);
    await (agent as any).broadcastEvent(broadcastEventObj);
    logger.info(`${logPrefix} Event broadcast successfully`);
  } catch (err: any) {
    logger.error(`${logPrefix} Failed to broadcast to JulesWebhookBroadcaster`, { error: String(err) });
  }

  // 2. Notify JulesOverseer for AI-assisted answering (non-blocking)
  try {
    const overseer = await getAgentByName(env.ENGINEER_AGENT as any, 'singleton');
    logger.info(`${logPrefix} Notifying JulesOverseer for AI-assisted answering`);
    // Direct DO RPC — ingestEvent is a @callable on OverseerAgent
    const ingestEventObj = {
      type: 'clarification_request',
      sessionId: taskId,
      taskId,
      question: body.question,
      projectId: body.projectId,
      agentId: body.agentId,
      timestamp: new Date().toISOString(),
    };
    logger.info(`${logPrefix} Notifying JulesOverseer for AI-assisted answering: ${JSON.stringify(ingestEventObj)}`);
    await (overseer as any).ingestEvent(ingestEventObj);
    logger.info(`${logPrefix} Event notified successfully`);
  } catch (err: any) {
    logger.error(`${logPrefix} Failed to notify JulesOverseer`, { error: String(err) });
  }

  return c.json({
    ok: true,
    taskId,
    message: 'Clarification request received. AI response will be broadcast via WebSocket.',
  });
});

export default clarifyRouter;
