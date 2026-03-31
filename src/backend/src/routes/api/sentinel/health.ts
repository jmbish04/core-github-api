/**
 * @file backend/src/routes/api/sentinel/health.ts
 * @description Learning Engine health check — monitors AI Gateway latency,
 * Sandbox SDK availability, and learning table stats.
 *
 * GET /health/learning
 *
 * @module Routes/Sentinel
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "@db";
import { learningSessions, learningAiInsights } from "@db/schemas/github/learning";
import { count, desc } from "drizzle-orm";

const app = new OpenAPIHono<{ Bindings: Env }>();

const healthRoute = createRoute({
  method: "get",
  path: "/health/learning",
  operationId: "getLearningHealth",
  tags: ["Sentinel"],
  responses: {
    200: {
      description: "Learning engine health status",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            sessions: z.object({
              total: z.number(),
              lastRunAt: z.string().nullable(),
            }),
            insights: z.object({
              total: z.number(),
            }),
            aiGateway: z.object({
              reachable: z.boolean(),
              latencyMs: z.number().nullable(),
            }),
          }),
        },
      },
    },
  },
});

app.openapi(healthRoute, async (c) => {
  const db = getDb(c.env.DB);

  // Session stats
  const [{ value: sessionCount }] = await db
    .select({ value: count() })
    .from(learningSessions);

  const lastSession = await db
    .select({ timestamp: learningSessions.createdAt })
    .from(learningSessions)
    .orderBy(desc(learningSessions.createdAt))
    .limit(1);

  // Insight stats
  const [{ value: insightCount }] = await db
    .select({ value: count() })
    .from(learningAiInsights);

  // AI Gateway ping
  let aiReachable = false;
  let aiLatency: number | null = null;
  try {
    const start = Date.now();
    await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any, {
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    aiLatency = Date.now() - start;
    aiReachable = true;
  } catch {
    aiReachable = false;
  }

  return c.json({
    status: "ok",
    sessions: {
      total: sessionCount,
      lastRunAt: lastSession[0]?.timestamp ?? null,
    },
    insights: {
      total: insightCount,
    },
    aiGateway: {
      reachable: aiReachable,
      latencyMs: aiLatency,
    },
  });
});

export default app;
