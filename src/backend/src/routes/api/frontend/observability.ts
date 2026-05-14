/**
 * @file routes/api/frontend/observability.ts
 * @description API routes for querying observability logs persisted in D1.
 *
 * Endpoints:
 *   GET /events      — List observability_events with filters
 *   GET /browser     — List browser_tool_logs
 *   GET /web-queries — List web_query_logs (V8-13 subagent results)
 *   GET /stats       — Aggregate stats for dashboard cards
 */

import { Hono } from 'hono';
import { getDb } from '@db';
import {
  observabilityEvents,
  browserToolLogs,
  webQueryLogs,
} from '@db/schemas/logs/observability';
import { desc, eq, like, and, count } from 'drizzle-orm';

const app = new Hono<{ Bindings: Env }>();

// ── GET /events ────────────────────────────────────────────────────────────
app.get('/events', async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') || '50'), 200);
  const offset = Number(c.req.query('offset') || '0');
  const channel = c.req.query('channel');
  const agent = c.req.query('agent');
  const eventType = c.req.query('eventType');

  const conditions = [];
  if (channel) conditions.push(eq(observabilityEvents.channel, channel));
  if (agent) conditions.push(eq(observabilityEvents.agent, agent));
  if (eventType) conditions.push(like(observabilityEvents.eventType, `%${eventType}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(observabilityEvents)
      .where(where)
      .orderBy(desc(observabilityEvents.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(observabilityEvents).where(where),
  ]);

  return c.json({
    data: rows,
    total: totalResult[0]?.total ?? 0,
    limit,
    offset,
  });
});

// ── GET /browser ───────────────────────────────────────────────────────────
app.get('/browser', async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') || '50'), 200);
  const offset = Number(c.req.query('offset') || '0');
  const agentFilter = c.req.query('agentId');

  const where = agentFilter ? eq(browserToolLogs.agentId, agentFilter) : undefined;

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(browserToolLogs)
      .where(where)
      .orderBy(desc(browserToolLogs.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(browserToolLogs).where(where),
  ]);

  return c.json({
    data: rows,
    total: totalResult[0]?.total ?? 0,
    limit,
    offset,
  });
});

// ── GET /web-queries ───────────────────────────────────────────────────────
app.get('/web-queries', async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') || '50'), 200);
  const offset = Number(c.req.query('offset') || '0');
  const executionId = c.req.query('executionId');

  const where = executionId ? eq(webQueryLogs.executionId, executionId) : undefined;

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(webQueryLogs)
      .where(where)
      .orderBy(desc(webQueryLogs.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(webQueryLogs).where(where),
  ]);

  return c.json({
    data: rows,
    total: totalResult[0]?.total ?? 0,
    limit,
    offset,
  });
});

// ── GET /stats ─────────────────────────────────────────────────────────────
app.get('/stats', async (c) => {
  const db = getDb(c.env.DB);

  const [eventCount, browserCount, webQueryCount, channelBreakdown] = await Promise.all([
    db.select({ total: count() }).from(observabilityEvents),
    db.select({ total: count() }).from(browserToolLogs),
    db.select({ total: count() }).from(webQueryLogs),
    db
      .select({
        channel: observabilityEvents.channel,
        total: count(),
      })
      .from(observabilityEvents)
      .groupBy(observabilityEvents.channel),
  ]);

  return c.json({
    totalEvents: eventCount[0]?.total ?? 0,
    totalBrowserLogs: browserCount[0]?.total ?? 0,
    totalWebQueries: webQueryCount[0]?.total ?? 0,
    channelBreakdown,
  });
});

export default app;
