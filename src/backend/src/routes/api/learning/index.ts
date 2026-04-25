/**
 * @file backend/src/routes/api/learning/index.ts
 * @description Learning API routes — exposes insights, sessions, and workflow triggers.
 *
 * Routes:
 *   POST /sync           — trigger LearningWorkflow manually
 *   GET  /sessions       — list learning sessions (paginated)
 *   GET  /insights       — list AI insights with filters
 *   GET  /insights/global — aggregate counts by pattern type
 *   GET  /insights/:id   — single insight + joined messages
 *   POST /upscale        — trigger Jules standardization upscale
 *   GET  /health         — ingestor health status
 */

import { OpenAPIHono } from '@hono/zod-openapi';

import { getDb } from '@db';
import {
  learningSessions,
  learningAiInsights,
  learningAiInsightMessages,
  learningMessages,
} from '@db/schemas/github/learning';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { JulesService } from '@/services/jules/service';

export const learningRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /sync
// ---------------------------------------------------------------------------

// const SyncResponseSchema = z.object({
//   sessionId: z.string().nullable(),
//   status: z.string(),
//   workflowInstanceId: z.string().optional(),
// });

learningRouter.post('/sync', async (c) => {
  try {
    const workflow = (c.env as any).LEARNING_WORKFLOW;
    const instance = await workflow.create({
      params: { triggerType: 'manual', batchSize: 50 },
    });
    return c.json({ sessionId: null, status: 'started', workflowInstanceId: instance.id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /sessions
// ---------------------------------------------------------------------------

learningRouter.get('/sessions', async (c) => {
  const page = parseInt(c.req.query('page') ?? '1');
  const status = c.req.query('status');
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const db = getDb(c.env.DB);
    let query = db.select().from(learningSessions).$dynamic();
    if (status) {
      query = query.where(eq(learningSessions.status, status));
    }
    const sessions = await query
      .orderBy(desc(learningSessions.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ data: sessions, pagination: { page, limit } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /insights
// ---------------------------------------------------------------------------

learningRouter.get('/insights', async (c) => {
  const page = parseInt(c.req.query('page') ?? '1');
  const limit = 20;
  const offset = (page - 1) * limit;
  const patternType = c.req.query('patternType');
  const severityStr = c.req.query('severity');
  const statusFilter = c.req.query('status');
  const repo = c.req.query('repo');

  try {
    const db = getDb(c.env.DB);
    const conditions = [];

    if (patternType) conditions.push(eq(learningAiInsights.patternType, patternType as any));
    if (severityStr) conditions.push(gte(learningAiInsights.severity, parseInt(severityStr)));
    if (statusFilter) conditions.push(eq(learningAiInsights.status, statusFilter));
    if (repo) conditions.push(eq(learningAiInsights.repo, repo));

    let query = db.select().from(learningAiInsights).$dynamic();
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const insights = await query
      .orderBy(desc(learningAiInsights.severity), desc(learningAiInsights.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ data: insights, pagination: { page, limit } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /insights/global
// ---------------------------------------------------------------------------

learningRouter.get('/insights/global', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const rows = await db
      .select({
        patternType: learningAiInsights.patternType,
        count: sql<number>`count(*)`,
      })
      .from(learningAiInsights)
      .groupBy(learningAiInsights.patternType);

    return c.json({ data: rows });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /insights/:id
// ---------------------------------------------------------------------------

learningRouter.get('/insights/:id', async (c) => {
  const insightId = c.req.param('id');
  try {
    const db = getDb(c.env.DB);
    const insight = await db.select()
      .from(learningAiInsights)
      .where(eq(learningAiInsights.id, insightId))
      .limit(1);

    if (!insight[0]) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Join related messages
    const msgLinks = await db.select()
      .from(learningAiInsightMessages)
      .where(eq(learningAiInsightMessages.insightId, insightId));

    const msgs = msgLinks.length > 0
      ? await db.select().from(learningMessages)
          .where(
            // Simple IN workaround for SQLite
            sql`${learningMessages.id} IN (${sql.join(msgLinks.map(m => sql`${m.messageId}`), sql`, `)})`
          )
      : [];

    return c.json({ data: { ...insight[0], messages: msgs } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /upscale
// ---------------------------------------------------------------------------

learningRouter.post('/upscale', async (c) => {
  try {
    const julesService = JulesService.getInstance(c.env);
    const session = await julesService.startSession({
      prompt: 'Standardization upscale triggered by Learning Agent. Please review and apply the latest standardization rules to the current codebase.',
      agentId: 'LearningAgent',
      specialistClass: 'LearningAgent',
    });
    return c.json({ ok: true, sessionId: session.id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

learningRouter.get('/health', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const lastSession = await db.select()
      .from(learningSessions)
      .where(eq(learningSessions.status, 'completed'))
      .orderBy(desc(learningSessions.completedAt))
      .limit(1);

    const last = lastSession[0];
    const totalInsights = await db
      .select({ count: sql<number>`count(*)` })
      .from(learningAiInsights);

    return c.json({
      status: 'healthy',
      lastRun: last?.completedAt?.toISOString() ?? null,
      insightCount: totalInsights[0]?.count ?? 0,
    });
  } catch (err: any) {
    return c.json({ status: 'unhealthy', error: err.message }, 500);
  }
});
