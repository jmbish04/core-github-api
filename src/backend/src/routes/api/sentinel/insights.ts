/**
 * @file backend/src/routes/api/sentinel/insights.ts
 * @description AI Insights endpoints — global and repo-scoped queries.
 *
 * - GET  /insights         — list insights (global or filtered by ?repo=)
 * - GET  /stats/global     — aggregate stats over time
 *
 * @module Routes/Sentinel
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "@db";
import { learningAiInsights } from "@db/schemas/github/learning";
import { eq, desc, sql, count } from "drizzle-orm";

const app = new OpenAPIHono<{ Bindings: Env }>();

// ─── GET /insights ──────────────────────────────────────────────────────────

const listInsightsRoute = createRoute({
  method: "get",
  path: "/insights",
  operationId: "listInsights",
  tags: ["Sentinel"],
  request: {
    query: z.object({
      repo: z.string().optional(),
      status: z.string().optional(),
      patternType: z.string().optional(),
      limit: z.coerce.number().default(50),
      offset: z.coerce.number().default(0),
    }),
  },
  responses: {
    200: {
      description: "List of AI insights",
      content: {
        "application/json": {
          schema: z.object({
            insights: z.array(z.any()),
            total: z.number(),
          }),
        },
      },
    },
  },
});

app.openapi(listInsightsRoute, async (c) => {
  const { repo, status, patternType, limit, offset } = c.req.valid("query");
  const db = getDb(c.env.DB);

  const conditions: any[] = [];
  if (repo) conditions.push(eq(learningAiInsights.repo, repo));
  if (status) conditions.push(eq(learningAiInsights.status, status));
  if (patternType) conditions.push(eq(learningAiInsights.patternType, patternType as any));

  let query = db.select().from(learningAiInsights);
  for (const cond of conditions) {
    query = query.where(cond) as any;
  }

  const insights = await (query as any)
    .orderBy(desc(learningAiInsights.createdAt))
    .limit(limit)
    .offset(offset);

  // Count total
  let countQuery = db.select({ value: count() }).from(learningAiInsights);
  for (const cond of conditions) {
    countQuery = countQuery.where(cond) as any;
  }
  const [{ value: total }] = await countQuery;

  return c.json({ insights, total });
});

// ─── GET /stats/global ──────────────────────────────────────────────────────

const globalStatsRoute = createRoute({
  method: "get",
  path: "/stats/global",
  operationId: "getGlobalStats",
  tags: ["Sentinel"],
  responses: {
    200: {
      description: "Aggregate learning engine statistics",
      content: {
        "application/json": {
          schema: z.object({
            totalInsights: z.number(),
            byStatus: z.record(z.string(), z.number()),
            byPatternType: z.record(z.string(), z.number()),
            bySeverity: z.record(z.string(), z.number()),
            proposed: z.number(),
            open: z.number(),
          }),
        },
      },
    },
  },
});

app.openapi(globalStatsRoute, async (c) => {
  const db = getDb(c.env.DB);

  const [{ value: totalInsights }] = await db
    .select({ value: count() })
    .from(learningAiInsights);

  const statusCounts = await db
    .select({
      status: learningAiInsights.status,
      count: count(),
    })
    .from(learningAiInsights)
    .groupBy(learningAiInsights.status);

  const patternTypeCounts = await db
    .select({
      patternType: learningAiInsights.patternType,
      count: count(),
    })
    .from(learningAiInsights)
    .groupBy(learningAiInsights.patternType);

  const severityCounts = await db
    .select({
      severity: learningAiInsights.severity,
      count: count(),
    })
    .from(learningAiInsights)
    .groupBy(learningAiInsights.severity);

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) byStatus[row.status] = row.count;

  const byPatternType: Record<string, number> = {};
  for (const row of patternTypeCounts) byPatternType[row.patternType] = row.count;

  const bySeverity: Record<string, number> = {};
  for (const row of severityCounts) bySeverity[String(row.severity)] = row.count;

  return c.json({
    totalInsights,
    byStatus,
    byPatternType,
    bySeverity,
    proposed: byStatus["proposed"] || 0,
    open: byStatus["open"] || 0,
  });
});

export default app;
