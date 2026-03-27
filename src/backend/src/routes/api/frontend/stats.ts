// src/routes/api/frontend/stats.ts
// Exposes repo stats at /api/repos/stats/:owner/:repo
// (mounted via repos/index.ts → app.route('/stats', statsRouter))
import { Hono } from 'hono';
import { getDb } from "@db";
import { repositories, repoStats } from "@db/schemas/github/repos";
import { eq, and, sql } from 'drizzle-orm';

const statsRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/repos/stats/:owner/:repo
 * Returns cached repo stats from D1.
 */
statsRouter.get('/:owner/:repo', async (c) => {
    const { owner, repo } = c.req.param();
    const db = getDb(c.env.DB);

    const repoRecord = await db
        .select()
        .from(repositories)
        .where(and(
            sql`lower(${repositories.owner}) = lower(${owner})`,
            sql`lower(${repositories.name}) = lower(${repo})`,
        ))
        .limit(1);

    if (!repoRecord.length) {
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

    const row = await db
        .select()
        .from(repoStats)
        .where(eq(repoStats.repoId, repoRecord[0].id))
        .limit(1);

    return c.json({ success: true, stats: row[0] ?? null });
});

export default statsRouter;
