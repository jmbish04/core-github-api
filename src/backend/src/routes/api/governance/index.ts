/**
 * @file backend/src/routes/api/governance/index.ts
 * @description Governance API routes — AI-driven code quality analysis.
 *
 * Routes:
 *   POST /analyze — analyze conversation payload via LearningAgent DO
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { ConversationPayload } from '@agents/LearningAgent';

export const governanceRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /analyze
// ---------------------------------------------------------------------------

governanceRouter.post('/analyze', async (c) => {
  let body: { conversations?: ConversationPayload['conversations']; repoless?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.conversations) || body.conversations.length === 0) {
    return c.json({ error: 'conversations array is required' }, 400);
  }

  try {
    const agentId = (c.env as any).LEARNING_AGENT.idFromName('learning-agent');
    const agent = (c.env as any).LEARNING_AGENT.get(agentId);

    const res = await agent.fetch('http://internal/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversations: body.conversations,
        repoless: body.repoless ?? true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: err }, res.status);
    }

    const data = await res.json() as any;
    return c.json({ ok: true, sessionId: data.sessionId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
