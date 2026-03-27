import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "@db";
import { dailyTrends } from "@/db/schemas/github/webhooks";
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
    operationId: 'getRoot',
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
              trends: z.array(z.object({
                id: z.number(),
                date: z.string(),
                trendSummary: z.string(),
                topPicks: z.any(), // JSON
                sentInEmail: z.boolean(),
                createdAt: z.string()
              })),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DB_WEBHOOKS);
    
    // Fetch trends, sorted by date desc
    const trends = await db.select()
                           .from(dailyTrends)
                           .orderBy(desc(dailyTrends.date), desc(dailyTrends.createdAt))
                           .limit(50);

    return c.json({
      trends: trends.map(t => ({
        ...t,
        createdAt: t.createdAt, // It's already a string in new schema
        topPicks: t.topPicks,
        trendSummary: t.trendSummary
      }))
    });
  }
);

// POST / - Ingest Daily Trends & Send Email
app.openapi(
  createRoute({
    operationId: 'postRoot',
    method: "post",
    path: "/",
    summary: "Ingest Daily Trends",
    description: "Ingest a new daily trends report and send an email notification.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              date: z.string(),
              trend_summary: z.string(),
              top_picks: z.array(z.object({
                name: z.string(),
                url: z.string(),
                category: z.string(),
                why_its_interesting: z.string(),
                innovation_score: z.number().int()
              }))
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: "Trends ingested successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              id: z.number()
            })
          }
        }
      }
    }
  }),
  async (c) => {
    const db = getDb(c.env.DB_WEBHOOKS);
    const body = await c.req.json();
    
    // 1. Insert into DB
    const [inserted] = await db.insert(dailyTrends).values({
      date: body.date,
      trendSummary: body.trend_summary,
      topPicks: body.top_picks,
      createdAt: new Date().toISOString(),
      sentInEmail: true
    }).returning();

    // 2. Send Email
    if (c.env.SEND_EMAIL_NEWSLETTER) {
      const { sendRepoDiscoveryEmail } = await import("@/utils/email/send/repo-discovery");

      await sendRepoDiscoveryEmail(c.env, {
        subject: `Daily Trends: ${body.date}`,
        title: `Daily Trends: ${body.date}`,
        dailyTrendsData: {
          date: body.date,
          trend_summary: body.trend_summary,
          top_picks: body.top_picks
        }
      });
    }

    return c.json({ success: true, id: inserted.id });
  }
);

export default app;
