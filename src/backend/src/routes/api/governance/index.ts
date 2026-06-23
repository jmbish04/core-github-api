/**
 * @file backend/src/routes/api/governance/index.ts
 * @description Governance API routes — AI-driven code quality analysis.
 *
 * Routes:
 *   POST /analyze — analyze conversation payload via LearningAgent DO
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getAgentByName } from 'agents';

export const governanceRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /analyze
// ---------------------------------------------------------------------------

governanceRouter.post('/analyze', async (c) => {
  let body: { conversations?: any[]; repoless?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.conversations) || body.conversations.length === 0) {
    return c.json({ error: 'conversations array is required' }, 400);
  }

  try {
    const agent = await getAgentByName(c.env.LEARNING_AGENT as any, 'learning-agent');
    const sessionId = await (agent as any).analyzeConversation(
      { conversations: body.conversations, repoless: body.repoless ?? true },
      body.repoless ?? true,
    );

    return c.json({ ok: true, sessionId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
