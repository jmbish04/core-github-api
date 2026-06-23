import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { repoSyncConfigs } from '@/db/schemas/app';
import { getOctokit } from '@services/octokit/core';

export const standardizationRouter = new Hono<{ Bindings: Env }>()
  .get('/files', async (c) => {
    try {
      const octokit = await getOctokit(c.env);
      const { data } = await octokit.rest.git.getTree({
        owner: 'jmbish04',
        repo: 'core-github-standardization',
        tree_sha: 'main',
        recursive: 'true',
      });

      const files = data.tree
        .map((entry: any) => entry.path || '')
        .filter((path: string) => path && data.tree.find((e: any) => e.path === path)?.type === 'blob');

      return c.json({ files });
    } catch (error: any) {
      console.error('[Standardization] Failed to fetch standard files:', error);
      return c.json({ error: 'Failed to fetch standard files from repository' }, 500);
    }
  })
  .get('/configs', async (c) => {
    try {
      const db = getDb(c.env.DB);
      const configs = await db.select().from(repoSyncConfigs).all();
      return c.json({ configs });
    } catch (error: any) {
      console.error('[Standardization] Failed to fetch configs:', error);
      return c.json({ error: 'Failed to fetch sync configs' }, 500);
    }
  })
  .post(
    '/configs',
    zValidator(
      'json',
      createInsertSchema(repoSyncConfigs, {
        fileName: (s) => s.min(1),
        targetRepoPattern: (s) => s.min(1),
        triggerEvents: () => z.array(z.string()).min(1),
      }).pick({ fileName: true, targetRepoPattern: true, triggerEvents: true })
    ),
    async (c) => {
      try {
        const db = getDb(c.env.DB);
        const { fileName, targetRepoPattern, triggerEvents } = c.req.valid('json');

        const config = await db // Removed array destructuring
          .insert(repoSyncConfigs)
          .values({
            fileName,
            targetRepoPattern,
            triggerEvents: JSON.stringify(triggerEvents),
            isActive: true,
          })
          .returning()
          .get(); // Removed duplicate .get()

        return c.json({ config });
      } catch (error: any) {
        console.error('[Standardization] Failed to create config:', error);
        return c.json({ error: 'Failed to create sync config' }, 500);
      }
    }
  )
  .delete(
    '/configs/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      try {
        const db = getDb(c.env.DB);
        const { id } = c.req.valid('param');

        await db.delete(repoSyncConfigs).where(eq(repoSyncConfigs.id, id)).run();

        return c.json({ success: true });
      } catch (error: any) {
        console.error('[Standardization] Failed to delete config:', error);
        return c.json({ error: 'Failed to delete sync config' }, 500);
      }
    }
  )
  .post(
    '/search-repos',
    zValidator(
      'json',
      z.object({
        fileName: z.string().min(1)
      })
    ),
    async (c) => {
      try {
        const octokit = await getOctokit(c.env);
        const { fileName } = c.req.valid('json');

        const q = `filename:${fileName} user:jmbish04`; // Reverted to original correct string

        const { data } = await octokit.rest.search.code({
          q,
          per_page: 100,
        });

        // Deduplicate repos (since a repo might have multiple files matching the q, though less likely for exact filename)
        const reposMap = new Map<string, typeof data.items[0]['repository']>();
        for (const item of data.items) {
          reposMap.set(item.repository.full_name, item.repository);
        }

        const repos = Array.from(reposMap.values()).map(r => ({
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
        }));

        return c.json({ repos, totalCount: data.total_count });
      } catch (error: any) {
        console.error('[Standardization] Failed to search repos:', error);
        return c.json({ error: 'Failed to search repositories' }, 500);
      }
    }
  )
  .post(
    '/bulk-delete',
    zValidator(
      'json',
      z.object({
        repos: z.array(z.string()), // Format: owner/repo
        fileName: z.string().min(1)
      })
    ),
    async (c) => {
      try {
        const octokit = await getOctokit(c.env);
        const { repos, fileName } = c.req.valid('json');
        
        const results = [];

        for (const fullRepo of repos) {
          try {
            const [owner, name] = fullRepo.split('/');
            
            // 1. Get the repo's default branch
            const repoData = await octokit.rest.repos.get({ owner, repo: name });
            const branch = repoData.data.default_branch;

            // 2. See if the file exists on that branch
            try {
              const fileData = await octokit.rest.repos.getContent({
                owner,
                repo: name,
                path: fileName,
                ref: branch
              });

              if (!Array.isArray(fileData.data) && fileData.data.type === 'file') {
                // File exists, let's delete it
                await octokit.rest.repos.deleteFile({
                  owner,
                  repo: name,
                  path: fileName,
                  message: `chore: remove legacy standard file ${fileName}`,
                  sha: fileData.data.sha,
                  branch
                });
                results.push({ repo: fullRepo, success: true, message: 'Deleted file' });
              } else {
                 results.push({ repo: fullRepo, success: false, message: 'Path is a directory, not a file' });
              }
            } catch (err: any) {
               if (err.status === 404) {
                 results.push({ repo: fullRepo, success: true, message: 'File did not exist, skipped' });
               } else {
                 throw err;
               }
            }
          } catch (err: any) {
            console.error(`[Standardization] Failed to delete in ${fullRepo}:`, err);
            results.push({ repo: fullRepo, success: false, error: err.message || 'Unknown error' });
          }
        }

        return c.json({ results });
      } catch (error: any) {
        console.error('[Standardization] Bulk delete failed:', error);
        return c.json({ error: 'Failed to execute bulk delete' }, 500);
      }
    }
  );
