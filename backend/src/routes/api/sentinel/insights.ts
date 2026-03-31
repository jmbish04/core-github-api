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
import { aiInsights } from "@/db/schemas/github/learning/ai-insights";
import { eq, desc, sql, count, isNull } from "drizzle-orm";

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
      category: z.string().optional(),
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
  const { repo, status, category, limit, offset } = c.req.valid("query");
  const db = getDb(c.env.DB);

  const conditions: any[] = [];
  if (repo) conditions.push(eq(aiInsights.githubRepo, repo));
  if (status) conditions.push(eq(aiInsights.status, status));
  if (category) conditions.push(eq(aiInsights.category, category));

  let query = db.select().from(aiInsights);
  for (const cond of conditions) {
    query = query.where(cond) as any;
  }

  const insights = await (query as any)
    .orderBy(desc(aiInsights.timestamp))
    .limit(limit)
    .offset(offset);

  // Count total
  let countQuery = db.select({ value: count() }).from(aiInsights);
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
            byStatus: z.record(z.number()),
            byCategory: z.record(z.number()),
            bySeverity: z.record(z.number()),
            immunized: z.number(),
            pending: z.number(),
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
    .from(aiInsights);

  const statusCounts = await db
    .select({
      status: aiInsights.status,
      count: count(),
    })
    .from(aiInsights)
    .groupBy(aiInsights.status);

  const categoryCounts = await db
    .select({
      category: aiInsights.category,
      count: count(),
    })
    .from(aiInsights)
    .groupBy(aiInsights.category);

  const severityCounts = await db
    .select({
      severity: aiInsights.severity,
      count: count(),
    })
    .from(aiInsights)
    .groupBy(aiInsights.severity);

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) byStatus[row.status] = row.count;

  const byCategory: Record<string, number> = {};
  for (const row of categoryCounts) byCategory[row.category] = row.count;

  const bySeverity: Record<string, number> = {};
  for (const row of severityCounts) bySeverity[row.severity] = row.count;

  return c.json({
    totalInsights,
    byStatus,
    byCategory,
    bySeverity,
    immunized: byStatus["IMMUNIZED"] || 0,
    pending: byStatus["PENDING"] || 0,
  });
});

export default app;
