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
    if (c.env.SEB) {
      const { sendEmail } = await import("@utils/email");
      
      const htmlContent = `
        <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Daily GitHub Trends: ${body.date}</h2>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h3 style="margin-top: 0; color: #111827;">AI Summary</h3>
          <p style="color: #374151; line-height: 1.6;">${body.trend_summary}</p>
        </div>
        
        <h3 style="color: #111827;">Top Picks</h3>
        <ul style="list-style: none; padding: 0;">
          ${(body.top_picks as any[]).map((repo: any) => `
            <li style="padding: 20px; margin: 15px 0; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px;">
                <a href="${repo.url}" style="font-size: 18px; font-weight: 600; color: #2563eb; text-decoration: none;">${repo.name}</a>
                <span style="background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;">Score: ${repo.innovation_score}/10</span>
              </div>
              <div style="margin-bottom: 8px;">
                 <span style="background: #f3f4f6; color: #4b5563; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${repo.category}</span>
              </div>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0;">${repo.why_its_interesting}</p>
            </li>
          `).join('')}
        </ul>
      `;

      await sendEmail(c.env, {
        to: (c.env as any).NOTIFICATION_EMAIL || "ai@126colby.com",
        subject: `Daily Trends: ${body.date}`,
        contentHtml: htmlContent
      });
    }

    return c.json({ success: true, id: inserted.id });
  }
);

export default app;
