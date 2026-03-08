// src/routes/api/stats.ts
import { Hono } from 'hono';
import { Bindings } from "@utils/hono";
import { getDb } from "@db";
import { repoStats, repos } from "@db/schema";
import { eq, and } from 'drizzle-orm';

const statsApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/stats
statsApi.get('/repos/:owner/:repo/stats', async (c) => {
    const { owner, repo } = c.req.param();
    const db = getDb(c.env.DB);

    const repoRecord = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, repo))).limit(1);

    if (!repoRecord.length) {
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

    const row = await db.select().from(repoStats).where(eq(repoStats.repoId, repoRecord[0].id)).limit(1);
    return c.json({ success: true, stats: row[0] || null });
});

export default statsApi;
