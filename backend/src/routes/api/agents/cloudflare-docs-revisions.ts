/**
 * @file backend/src/routes/api/agents/cloudflare-docs-revisions.ts
 *
 * GET /api/agents/cloudflare-docs/prompt-revisions
 * Returns the last 50 prompt revision records from D1.
 * Requires auth (same WORKER_API_KEY via x-api-key or Authorization header).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { desc } from "drizzle-orm";
import { promptRevisions } from "@db/schema";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

async function requireAuth(c: any): Promise<boolean> {
  const key =
    c.req.header("x-api-key") ??
    c.req.header("authorization")?.replace("Bearer ", "");
  const { getWorkerApiKey } = await import("@utils/secrets");
  const expected = await getWorkerApiKey(c.env);
  return !!key && !!expected && key === String(expected);
}

app.get("/", async (c) => {
  if (!(await requireAuth(c))) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const db = drizzle(c.env.DB);
    const revisions = await db
      .select()
      .from(promptRevisions)
      .orderBy(desc(promptRevisions.timestamp))
      .limit(50);

    return c.json({ success: true, revisions });
  } catch (err: any) {
    console.error("[revisions] DB error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
