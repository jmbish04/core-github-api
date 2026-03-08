
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb } from '@db';
import { researchJudgeLogs } from '@/db/schemas/github/webhooks';
import { desc } from 'drizzle-orm';

const app = new OpenAPIHono<{ Bindings: Env }>();

// POST /upsert/research-judge
app.openapi(
  createRoute({
    method: 'post',
    path: '/upsert/research-judge',
    summary: 'Upsert Research Judge Logs',
    description: 'Ingest results from the GitHub Action Research Judge.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              query: z.string(),
              results: z.object({
                is_relevant: z.boolean(),
                ai_features_found: z.array(z.string()),
                summary: z.string(),
                confidence_score: z.number(),
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Log ingested successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              id: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DB_WEBHOOKS);
    const body = await c.req.json();

    const [inserted] = await db.insert(researchJudgeLogs).values({
      query: body.query,
      isRelevant: body.results.is_relevant,
      aiFeatures: body.results.ai_features_found as any,
      summary: body.results.summary,
      confidenceScore: body.results.confidence_score,
      createdAt: new Date().toISOString(),
    }).returning();

    return c.json({ success: true, id: inserted.id });
  }
);

// GET /research-judge
app.openapi(
  createRoute({
    method: 'get',
    path: '/research-judge',
    summary: 'Get Research Judge Logs',
    description: 'Retrieve logged research judge results.',
    responses: {
      200: {
        description: 'List of logs',
        content: {
          'application/json': {
            schema: z.object({
              logs: z.array(z.object({
                id: z.number(),
                query: z.string(),
                isRelevant: z.boolean(),
                aiFeatures: z.array(z.string()),
                summary: z.string(),
                confidenceScore: z.number(),
                createdAt: z.string(),
              })),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DB_WEBHOOKS);
    const logs = await db.select().from(researchJudgeLogs).orderBy(desc(researchJudgeLogs.createdAt)).limit(100);
    return c.json({ logs: logs.map(l => ({ ...l, aiFeatures: l.aiFeatures as string[] })) });
  }
);

export default app;
