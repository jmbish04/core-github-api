import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { getDb, agentSkills, agentSkillAllowedTools } from '@db';
import { eq } from 'drizzle-orm';
import { getOctokit } from '@/services/octokit/core';
import { Logger } from '@/lib/logger';

// --- Drizzle-Zod Derived Schemas ---
const SkillSchema = createSelectSchema(agentSkills, {
  createdAt: () => z.string().openapi({ description: 'ISO Timestamp' }),
  updatedAt: () => z.string().openapi({ description: 'ISO Timestamp' }),
});

const CreateSkillSchema = createInsertSchema(agentSkills).pick({
  name: true,
  description: true,
  markdownContent: true,
  githubPath: true,
});

const SyncRequestSchema = z.object({
  skillIds: z.array(z.string()).optional().openapi({ description: 'Specific IDs to sync. If empty, syncs all.' }),
});

const IngestRequestSchema = z.object({
  githubUrl: z.string().url().openapi({ description: 'URL to a GitHub folder containing SKILL.md files (e.g. https://github.com/cloudflare/skills/tree/main/skills)' }),
});

const IngestStructuredSchema = z.object({
  owner: z.string().min(1).openapi({ description: 'GitHub owner or org', example: 'google-labs-code' }),
  repo: z.string().min(1).openapi({ description: 'Repository name', example: 'stitch-skills' }),
  path: z.string().min(1).openapi({ description: 'Target path within repo', example: 'skills' }),
  branch: z.string().min(1).openapi({ description: 'Branch name', example: 'main' }),
});

export const skillsApi = new OpenAPIHono<{ Bindings: Env }>();

// GET /api/skills
skillsApi.openapi(
  {
    method: 'get',
    path: '/',
    summary: 'List all skills',
    responses: {
      200: {
        description: 'A list of agent skills',
        content: { 'application/json': { schema: z.array(SkillSchema) } },
      },
    },
  },
  async (c) => {
    const db = getDb(c.env.DB);
    const skills = await db.select().from(agentSkills);
    
    return c.json(
      skills.map(s => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString()
      }))
    );
  }
);

// POST /api/skills
skillsApi.openapi(
  {
    method: 'post',
    path: '/',
    summary: 'Create or update a skill',
    request: {
      body: {
        content: { 'application/json': { schema: CreateSkillSchema } },
      },
    },
    responses: {
      200: {
        description: 'The created/updated skill',
        content: { 'application/json': { schema: SkillSchema } },
      },
    },
  },
  async (c) => {
    const body = c.req.valid('json');
    const db = getDb(c.env.DB);
    const id = crypto.randomUUID();
    const now = new Date();

    const [skill] = await db.insert(agentSkills).values({
      id,
      name: body.name,
      description: body.description,
      markdownContent: body.markdownContent,
      githubPath: body.githubPath,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return c.json({
      ...skill!,
      createdAt: skill!.createdAt.toISOString(),
      updatedAt: skill!.updatedAt.toISOString()
    });
  }
);

// Helper to parse github tree URL
function parseGithubTreeUrl(url: string) {
  // https://github.com/cloudflare/skills/tree/main/skills
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!, ref: match[3]!, path: match[4]! };
}

// POST /api/skills/ingest
skillsApi.openapi(
  {
    method: 'post',
    path: '/ingest',
    summary: 'Ingest SKILL.md files from a GitHub repository folder',
    request: {
      body: { content: { 'application/json': { schema: IngestRequestSchema } } },
    },
    responses: {
      200: { description: 'Ingestion complete', content: { 'application/json': { schema: z.object({ message: z.string(), imported: z.number() }) } } },
      400: { description: 'Invalid URL', content: { 'application/json': { schema: z.object({ error: z.string() }) } } }
    },
  },
  async (c) => {
    const { githubUrl } = c.req.valid('json');
    const parsed = parseGithubTreeUrl(githubUrl);
    
    if (!parsed) {
      return c.json({ error: 'Invalid GitHub tree URL format.' }, 400);
    }

    const { owner, repo, ref, path } = parsed;
    const octokit = await getOctokit(c.env);
    const db = getDb(c.env.DB);

    let importedCount = 0;

    try {
      // Get the tree
      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: ref,
        recursive: '1'
      });

      // Find all SKILL.md files inside the base path
      const skillFiles = treeData.tree.filter(t => 
        t.type === 'blob' && 
        t.path?.startsWith(path) && 
        t.path.endsWith('SKILL.md')
      );

      for (const file of skillFiles) {
        if (!file.path) continue;
        
        // Fetch raw content
        const { data: fileData } = await octokit.repos.getContent({
          owner,
          repo,
          path: file.path,
          ref
        });

        if ('content' in fileData && fileData.content) {
          const markdownContent = atob(fileData.content);
          
          // Try to extract name/description from yaml frontmatter or simple markdown
          const nameMatch = markdownContent.match(/name:\s*(.+)/);
          const descMatch = markdownContent.match(/description:\s*(.+)/);
          
          const components = file.path.split('/');
          const folderName = components[components.length - 2];
          
          const name = nameMatch ? nameMatch[1]?.trim() : folderName || 'Unknown Skill';
          const description = descMatch ? descMatch[1]?.trim() : 'Imported from GitHub';

          const now = new Date();
          
          // Check if it already exists by githubPath
          const githubPath = `https://github.com/${owner}/${repo}/blob/${ref}/${file.path}`;
          
          const existing = await db.select().from(agentSkills).where(eq(agentSkills.githubPath, githubPath)).get();

          if (existing) {
             await db.update(agentSkills).set({
               name: name!,
               description: description!,
               markdownContent,
               updatedAt: now
             }).where(eq(agentSkills.id, existing.id));
          } else {
             await db.insert(agentSkills).values({
               id: crypto.randomUUID(),
               name: name!,
               description: description!,
               markdownContent,
               githubPath,
               createdAt: now,
               updatedAt: now,
             });
          }
          importedCount++;
        }
      }

      return c.json({ message: `Successfully ingested ${importedCount} skills.`, imported: importedCount }, 200);
    } catch (e: any) {
      return c.json({ error: `GitHub API error: ${e.message}` }, 400);
    }
  }
);

// POST /api/skills/seed
skillsApi.openapi(
  {
    method: 'post',
    path: '/seed',
    summary: 'Seeds default skills from predefined cloudflare and stitch repositories',
    responses: {
      200: { description: 'Seeding initiated', content: { 'application/json': { schema: z.object({ message: z.string() }) } } },
    },
  },
  async (c) => {
    // Fire and forget because it might take a while to traverse both repos
    c.executionCtx.waitUntil((async () => {
      try {
        // Instead of fetch, let's just make the manual calls here
        const targets = [
          'https://github.com/cloudflare/skills/tree/main/skills',
          'https://github.com/google-labs-code/stitch-skills/tree/main/skills'
        ];

        const octokit = await getOctokit(c.env);
        const db = getDb(c.env.DB);

        for (const target of targets) {
          const parsed = parseGithubTreeUrl(target);
          if (!parsed) continue;

          const { owner, repo, ref, path } = parsed;
          
          const { data: treeData } = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: ref,
            recursive: '1'
          });

          const skillFiles = treeData.tree.filter(t => 
            t.type === 'blob' && 
            t.path?.startsWith(path) && 
            t.path.endsWith('SKILL.md')
          );

          for (const file of skillFiles) {
            if (!file.path) continue;
            
            const { data: fileData } = await octokit.repos.getContent({
              owner,
              repo,
              path: file.path,
              ref
            });

            if ('content' in fileData && fileData.content) {
              const markdownContent = atob(fileData.content);
              const nameMatch = markdownContent.match(/name:\s*(.+)/);
              const descMatch = markdownContent.match(/description:\s*(.+)/);
              const components = file.path.split('/');
              const folderName = components[components.length - 2];
              const name = nameMatch ? nameMatch[1]?.trim() : folderName || 'Unknown Skill';
              const description = descMatch ? descMatch[1]?.trim() : 'Imported from GitHub';

              const now = new Date();
              const githubPath = `https://github.com/${owner}/${repo}/blob/${ref}/${file.path}`;
              
              const existing = await db.select().from(agentSkills).where(eq(agentSkills.githubPath, githubPath)).get();

              if (!existing) {
                 await db.insert(agentSkills).values({
                   id: crypto.randomUUID(),
                   name: name!,
                   description: description!,
                   markdownContent,
                   githubPath,
                   createdAt: now,
                   updatedAt: now,
                 });
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to seed skills", e);
      }
    })());

    return c.json({ message: 'Skill seeding started in background.' });
  }
);

// ---------------------------------------------------------------------------
// POST /api/skills/ingest-structured
// Structured ingestion with { owner, repo, path, branch } + tool extraction
// ---------------------------------------------------------------------------
skillsApi.openapi(
  {
    method: 'post',
    path: '/ingest-structured',
    summary: 'Ingest SKILL.md files using structured owner/repo/path/branch input',
    request: {
      body: { content: { 'application/json': { schema: IngestStructuredSchema } } },
    },
    responses: {
      200: {
        description: 'Ingestion result',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              ingested: z.array(z.string()),
              toolsInserted: z.number(),
            }),
          },
        },
      },
      400: {
        description: 'Ingestion error',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  },
  (async (c: any) => {
    const logger = new Logger(c.env, 'SkillsAPI:ingest-structured');
    const { owner, repo, path, branch } = c.req.valid('json');

    logger.info(`Starting structured ingestion from ${owner}/${repo}/${path}@${branch}`);

    try {
      const octokit = await getOctokit(c.env);
      const db = getDb(c.env.DB);

      // Fetch the repository tree
      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: '1',
      });

      // Find all SKILL.md files
      const skillFiles = treeData.tree.filter(
        (t) => t.type === 'blob' && t.path?.startsWith(path) && t.path.endsWith('SKILL.md')
      );

      const ingestedNames: string[] = [];
      let totalToolsInserted = 0;

      for (const file of skillFiles) {
        if (!file.path) continue;

        const { data: fileData } = await octokit.repos.getContent({
          owner,
          repo,
          path: file.path,
          ref: branch,
        });

        if (!('content' in fileData) || !fileData.content) continue;

        const markdownContent = atob(fileData.content);
        const components = file.path.split('/');
        const folderName = components[components.length - 2];

        // Parse frontmatter
        const nameMatch = markdownContent.match(/name:\s*(.+)/);
        const descMatch = markdownContent.match(/description:\s*(.+)/);
        const name = nameMatch ? nameMatch[1]!.trim() : folderName || 'Unknown Skill';
        const description = descMatch ? descMatch[1]!.trim() : 'Imported from GitHub';

        // Graceful tool extraction — parse allowed-tools or tools YAML key if present
        const toolsMatch = markdownContent.match(/(?:allowed-tools|tools):\s*\[([^\]]*)\]/i);
        const parsedTools: string[] = [];
        if (toolsMatch && toolsMatch[1]) {
          const raw = toolsMatch[1].split(',').map((t) => t.replace(/["'\n\r]/g, '').trim()).filter(Boolean);
          parsedTools.push(...raw);
        }

        const now = new Date();
        const githubPath = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;

        // Upsert the skill
        const existing = await db.select().from(agentSkills).where(eq(agentSkills.githubPath, githubPath)).get();
        let skillId: string;

        if (existing) {
          skillId = existing.id;
          await db.update(agentSkills).set({
            name,
            description,
            markdownContent,
            updatedAt: now,
          }).where(eq(agentSkills.id, existing.id));

          // Clear old tool mappings before re-inserting
          await db.delete(agentSkillAllowedTools).where(eq(agentSkillAllowedTools.skillId, skillId));
        } else {
          skillId = crypto.randomUUID();
          await db.insert(agentSkills).values({
            id: skillId,
            name,
            description,
            markdownContent,
            githubPath,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Batch insert allowed tools if any were extracted
        if (parsedTools.length > 0) {
          const toolInserts = parsedTools.map((toolName) => ({
            id: crypto.randomUUID(),
            skillId,
            toolName,
          }));
          await db.insert(agentSkillAllowedTools).values(toolInserts);
          totalToolsInserted += toolInserts.length;
        }

        ingestedNames.push(name);
      }

      logger.info(`Successfully ingested ${ingestedNames.length} skills with ${totalToolsInserted} tool mappings`);
      await logger.flush();

      return c.json({ success: true, ingested: ingestedNames, toolsInserted: totalToolsInserted });
    } catch (error: any) {
      logger.error('Structured skill ingestion failed', { error: error.message });
      await logger.flush();
      return c.json({ error: `Ingestion failed: ${error.message}` }, 400);
    }
  }) as any
);

// POST /api/skills/sync
skillsApi.openapi(
  {
    method: 'post',
    path: '/sync',
    summary: 'Push local skills to core-github-standardization repo',
    request: {
      body: { content: { 'application/json': { schema: SyncRequestSchema } } },
    },
    responses: {
      200: { description: 'Sync complete', content: { 'application/json': { schema: z.object({ message: z.string(), count: z.number() }) } } },
    },
  },
  async (c) => {
    const { skillIds } = c.req.valid('json');
    const db = getDb(c.env.DB);
    
    const query = db.select().from(agentSkills);
    const skills = await query;
    const toSync = skillIds && skillIds.length > 0 ? skills.filter(s => skillIds.includes(s.id)) : skills;

    const octokit = await getOctokit(c.env);
    const owner = 'jmbish04';
    const repo = 'core-github-standardization';
    const branch = 'main';

    let syncedCount = 0;

    for (const skill of toSync) {
      // Safe folder name
      const safeName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const targetPath = `.agent/skills/${safeName}/SKILL.md`;

      try {
        // Find existing sha if any to overwrite
        let sha: string | undefined;
        try {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: targetPath,
            ref: branch
          });
          if (!Array.isArray(data) && data.type === 'file') {
            sha = data.sha;
          }
        } catch {
          // File doesn't exist yet, we will create
        }

        // Commit via Octokit
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: targetPath,
          message: `Update skill ${skill.name} via Agentic Config`,
          content: Buffer.from(skill.markdownContent, 'utf-8').toString('base64'),
          sha,
          branch,
        });

        syncedCount++;
      } catch (e) {
        console.error(`Failed to push skill ${skill.name} to repo:`, e);
      }
    }
    
    return c.json({ message: `Successfully synced ${syncedCount} skills to ${owner}/${repo}.`, count: syncedCount });
  }
);

export default skillsApi;
