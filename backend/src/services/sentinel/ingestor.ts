/**
 * @file backend/src/services/sentinel/ingestor.ts
 * @description Sentinel Ingestor — small Hono router mounted at /api/sentinel/
 * for ingesting conversation payloads and querying AI insights.
 *
 * Routes:
 *   POST /ingest    — accepts a conversation payload, triggers LearningWorkflow
 *   GET  /patterns  — top 10 high-severity insights (severity >= 4)
 *   GET  /status    — ingestor health + last run info
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getDb } from '@db';
import { learningAiInsights, learningSessions } from '@db/schemas/github/learning';
import { gte, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

export const ingestorRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /ingest
// ---------------------------------------------------------------------------

ingestorRouter.post('/ingest', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const conversations: Array<{ role: string; content: string; timestamp?: string }> =
    body.conversations ?? [];

  if (!Array.isArray(conversations) || conversations.length === 0) {
    return c.json({ error: 'conversations array is required and must not be empty' }, 400);
  }

  try {
    const workflow = (c.env as any).LEARNING_WORKFLOW;
    const instance = await workflow.create({
      params: {
        triggerType: 'manual',
        batchSize: 50,
      },
    });

    // Also call LearningAgent to analyze the provided conversations immediately
    const agentId = (c.env as any).LEARNING_AGENT.idFromName('learning-agent');
    const agent = (c.env as any).LEARNING_AGENT.get(agentId);
    const analyzeRes = await agent.fetch('http://internal/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversations, repoless: body.repoless ?? false }),
    });

    const analyzeData = analyzeRes.ok ? await analyzeRes.json() as any : null;

    return c.json({
      ok: true,
      workflowInstanceId: instance.id,
      sessionId: analyzeData?.sessionId,
      status: 'started',
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /patterns
// ---------------------------------------------------------------------------

ingestorRouter.get('/patterns', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const insights = await db.select()
      .from(learningAiInsights)
      .where(gte(learningAiInsights.severity, 4))
      .orderBy(desc(learningAiInsights.severity), desc(learningAiInsights.createdAt))
      .limit(10);

    return c.json({ insights });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

ingestorRouter.get('/status', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const lastSession = await db.select()
      .from(learningSessions)
      .where(eq(learningSessions.status, 'completed'))
      .orderBy(desc(learningSessions.completedAt))
      .limit(1);

    const last = lastSession[0];

    return c.json({
      status: 'healthy',
      lastRun: last?.completedAt?.toISOString() ?? null,
      lastInsightCount: last?.insightCount ?? 0,
      lastSessionId: last?.id ?? null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
