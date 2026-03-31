/**
 * @file src/routes/stars-handler.ts
 * @description Handler for syncing GitHub stars from the user's action.
 * @owner AI-Builder
 */

import { Hono } from 'hono'
import type { Context } from 'hono'

import { getDb } from "@db"
import { repositories, starredRepos, repoMetrics } from "@db"
import { sql } from "drizzle-orm"

const app = new Hono<{ Bindings: Env }>()

app.post('/', async (c: Context<{ Bindings: Env }>): Promise<Response> => {
  // 1. Auth Check (Manual reuse of logic or rely on middleware if applied)
  // Since we mount this at root /upsert/stars, we should check api key if middleware doesn't cover it.
  // We will add middleware cover in index.ts, but safe to double check or just rely on index.ts.
  // Let's assume index.ts will adding app.use('/upsert/*', requireApiKey).
  
  try {
    const body = await c.req.json();
    const { username, count, stars } = body;

    if (!username || !Array.isArray(stars)) {
      return c.json({ error: "Invalid payload" }, 400);
    }

    const db = getDb(c.env.DB);
    const batchSize = 50;
    
    // Chunk the stars
    for (let i = 0; i < stars.length; i += batchSize) {
      const chunk = stars.slice(i, i + batchSize);

      // Prepare repositories
      const rValues = chunk.map((repo: any) => ({
        id: `github:${repo.full_name}`,
        provider: "github",
        owner: repo.owner?.login || username, // fallback
        name: repo.name,
        slug: `github:${repo.full_name}`,
        repoUrl: repo.html_url,
        description: repo.description ? repo.description.substring(0, 500) : null,
        topicsJson: JSON.stringify(repo.topics || []),
        visibility: repo.private ? "private" : "public",
        createdAt: repo.created_at || new Date().toISOString(),
        updatedAt: repo.updated_at || new Date().toISOString(),
      }));

       // Prepare metrics
       const mValues = chunk.map((repo: any) => ({
        repoId: `github:${repo.full_name}`,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        lastCommitAt: repo.pushed_at || new Date().toISOString(),
        defaultBranch: repo.default_branch
      }));

      // Prepare user_stars
      const sValues = chunk.map((repo: any) => ({
        userId: username,
        repoId: `github:${repo.full_name}`,
        starredAt: new Date().toISOString(), 
        syncBatchId: c.req.header("X-Correlation-ID")
      }));

      // Upsert Repositories
      // We use onConflictDoUpdate to keep details fresh
      await db.insert(repositories).values(rValues)
        .onConflictDoUpdate({
          target: repositories.id,
          set: {
            updatedAt: sql`excluded.updated_at`,
            topicsJson: sql`excluded.topics_json`,
            description: sql`excluded.description`
          }
        });

      // Upsert Metrics
      await db.insert(repoMetrics).values(mValues)
        .onConflictDoUpdate({
            target: repoMetrics.repoId,
            set: {
                stars: sql`excluded.stars`,
                forks: sql`excluded.forks`,
                openIssues: sql`excluded.open_issues`,
                lastCommitAt: sql`excluded.last_commit_at`
            }
        });

      // Upsert Stars linkage
      await db.insert(starredRepos).values(sValues)
        .onConflictDoNothing(); // If already starred, no-op
    }

    return c.json({ 
      success: true, 
      processed: stars.length, 
      message: `Synced ${stars.length} stars for ${username}` 
    });

  } catch (err: any) {
    console.error(`[StarsSync] Failed: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

export default app;
