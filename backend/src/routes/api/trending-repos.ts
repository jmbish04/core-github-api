import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schemas/github/webhooks";
import { eq } from "drizzle-orm";


const trendingReposApi = new Hono<{ Bindings: Env }>();

// GET /actions/daily-trends/get/indexed/list
trendingReposApi.get("/get/indexed/list", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  const expectedApiKey = await c.env.WORKER_API_KEY.get();
  if (apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const db = drizzle(c.env.DB_WEBHOOKS, { schema });
    const repos = await db.query.trendingRepos.findMany({
      columns: {
        url: true,
      },
    });

    const urlList = repos.map((r) => r.url);
    return c.json(urlList);
  } catch (error) {
    console.error("Error fetching trending repos list:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// POST /actions/daily-trends/upsert
trendingReposApi.post(
  "/upsert",
  zValidator(
    "json",
    z.object({
      session_uuid: z.string(),
      owner: z.string(),
      name: z.string(),
      url: z.string().url(),
      ai_analysis: z.record(z.string(), z.any()).optional(), // Flexible JSON
      why_justin_interested: z.string().optional(),
    })
  ),
  async (c) => {
    const apiKey = c.req.header("X-API-Key");
    const expectedApiKey = await c.env.WORKER_API_KEY.get();
    if (apiKey !== expectedApiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const payload = c.req.valid("json");

    try {
      const db = drizzle(c.env.DB_WEBHOOKS, { schema });

      await db
        .insert(schema.trendingRepos)
        .values({
          sessionUuid: payload.session_uuid,
          owner: payload.owner,
          name: payload.name,
          url: payload.url,
          aiAnalysis: payload.ai_analysis as any,
          whyJustinInterested: payload.why_justin_interested,
        })
        .onConflictDoUpdate({
          target: schema.trendingRepos.url,
          set: {
            aiAnalysis: payload.ai_analysis as any,
            whyJustinInterested: payload.why_justin_interested,
            sessionUuid: payload.session_uuid,
            // We don't update createdAt, preserving the original discovery time
          },
        });

      return c.json({ success: true });
    } catch (error) {
      console.error("Error upserting trending repo:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
);

export default trendingReposApi;
