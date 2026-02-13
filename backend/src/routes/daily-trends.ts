import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "@db";
import { dailyTrends } from "@/db/schema-topic-research";
import { desc } from "drizzle-orm";

const app = new OpenAPIHono<{ Bindings: Env }>();

const DailyTrendSchema = z.object({
  id: z.string(),
  date: z.string(),
  category: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  sentInEmail: z.boolean(),
  createdAt: z.string(),
});

app.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "Get Daily Trends",
    description: "Retrieve the latest daily trends found by the automated research agent.",
    responses: {
      200: {
        description: "List of daily trends",
        content: {
          "application/json": {
            schema: z.object({
              trends: z.array(DailyTrendSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DB);
    
    // Fetch trends, sorted by date desc
    const trends = await db.select()
                           .from(dailyTrends)
                           .orderBy(desc(dailyTrends.date), desc(dailyTrends.createdAt))
                           .limit(50);

    return c.json({
      trends: trends.map(t => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        description: t.description || null
      }))
    });
  }
);

export default app;
