import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb, schema } from '@db';
import { eq } from 'drizzle-orm';
import { generateUuid } from '@/utils/common';
import { getCloudflareApiToken, getCloudflareAccountId } from '@/utils/secrets';
import { getCfSdkClient } from '@/cloudflare/client';
import { analyzeApplicationWithWorkerAI, type AppSummaryResult } from '@/services/appstore-worker-ai';

const app = new OpenAPIHono<{ Bindings: Env }>();

// Response schemas
const ApplicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  url: z.string().nullable(),
  githubRepo: z.string().nullable(),
  description: z.string().nullable(),
  summary: z.string().nullable(),
  lastDeployedDate: z.string().nullable(),
  lastTrafficDate: z.string().nullable(),
  lastBuildDate: z.string().nullable(),
  tags: z.array(z.object({
    id: z.string(),
    name: z.string(),
    hexColor: z.string().nullable(),
  })),
});

// ─── Shared Helper: Process AI result and persist tags + summary ───
export async function persistAiResult(
  env: Env,
  appId: string,
  aiResult: AppSummaryResult,
  currentTagsByName: Map<string, typeof schema.tags.$inferSelect>
) {
  const db = getDb(env.DB);

  // 1. Save the summary
  await db.update(schema.applications)
    .set({ summary: aiResult.summary, updatedAt: new Date() })
    .where(eq(schema.applications.id, appId));

  // 2. Create any new tags
  for (const newTag of aiResult.new_tags_to_create) {
    if (!currentTagsByName.has(newTag.name.toLowerCase())) {
      const tagId = generateUuid();
      await db.insert(schema.tags).values({
        id: tagId,
        name: newTag.name,
        description: newTag.description,
        hexColor: newTag.hex_color || '#3b82f6',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();

      // Update local map so subsequent iterations see it
      const latestTags = await db.select().from(schema.tags);
      for (const t of latestTags) {
        currentTagsByName.set(t.name.toLowerCase(), t);
      }
    }
  }

  // 3. Map assigned tags
  for (const tagName of aiResult.assigned_tag_names) {
    const tag = currentTagsByName.get(tagName.toLowerCase());
    if (tag) {
      await db.insert(schema.tagApplicationMapping).values({
        appId: appId,
        tagId: tag.id,
      }).onConflictDoNothing();
    }
  }

  // 4. Map newly created tags
  for (const newTag of aiResult.new_tags_to_create) {
    const tag = currentTagsByName.get(newTag.name.toLowerCase());
    if (tag) {
      await db.insert(schema.tagApplicationMapping).values({
        appId: appId,
        tagId: tag.id,
      }).onConflictDoNothing();
    }
  }
}

// ─── GET / — List all applications (+ on-demand AI for unsummarized) ───

const getAppsRoute = createRoute({
    operationId: 'getRoot',
  method: 'get',
  path: '/',
  summary: 'Get all App Store applications',
  responses: {
    200: {
      description: 'List of applications',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            applications: z.array(ApplicationSchema),
            pendingSummaries: z.number().optional(),
          }),
        },
      },
    },
  },
});

app.openapi(getAppsRoute, async (c) => {
  const db = getDb(c.env.DB);
  
  // Fetch apps
  const apps = await db.select().from(schema.applications);
  
  // Fetch tags and mappings
  const allTags = await db.select().from(schema.tags);
  const mappings = await db.select().from(schema.tagApplicationMapping);
  
  const tagsById = new Map(allTags.map(t => [t.id, t]));
  const mappingsByAppId = new Map<string, typeof allTags>();
  
  for (const mapping of mappings) {
    if (!mappingsByAppId.has(mapping.appId)) {
      mappingsByAppId.set(mapping.appId, []);
    }
    const tag = tagsById.get(mapping.tagId);
    if (tag) {
      mappingsByAppId.get(mapping.appId)!.push(tag);
    }
  }

  // ─── On-demand: detect unsummarized apps and process via waitUntil ───
  const unsummarized = apps.filter(a => !a.summary);
  const pendingSummaries = unsummarized.length;

  if (unsummarized.length > 0) {
    // Process up to 3 on page load (background, non-blocking)
    const batch = unsummarized.slice(0, 3);
    const currentTagsByName = new Map(allTags.map(t => [t.name.toLowerCase(), t]));
    const tagsForAi = allTags.map(t => ({ name: t.name, description: t.description }));

    c.executionCtx.waitUntil(
      (async () => {
        for (const app of batch) {
          try {
            console.log(`[AppStore:OnDemand] Analyzing ${app.name} with Worker AI...`);
            const aiResult = await analyzeApplicationWithWorkerAI(
              c.env,
              app.name,
              app.type,
              app.description,
              tagsForAi
            );
            await persistAiResult(c.env, app.id, aiResult, currentTagsByName);
            console.log(`[AppStore:OnDemand] ✅ Summary saved for ${app.name}`);
          } catch (err) {
            console.error(`[AppStore:OnDemand] ❌ Failed to analyze ${app.name}:`, err);
          }
        }
      })()
    );
  }

  const resultApps = apps.map(app => ({
    ...app,
    lastDeployedDate: app.lastDeployedDate?.toISOString() || null,
    lastTrafficDate: app.lastTrafficDate?.toISOString() || null,
    lastBuildDate: app.lastBuildDate?.toISOString() || null,
    tags: (mappingsByAppId.get(app.id) || []).map(t => ({
      id: t.id,
      name: t.name,
      hexColor: t.hexColor,
    })),
  }));

  return c.json({ success: true, applications: resultApps, pendingSummaries }, 200);
});

// ─── POST /sync — Pure metadata sync (no AI) ───

const syncRoute = createRoute({
    operationId: 'postSync',
  method: 'post',
  path: '/sync',
  summary: 'Sync applications from Cloudflare API (metadata only, AI runs via cron/page-load)',
  responses: {
    200: {
      description: 'Sync status',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            syncedCount: z.number(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(syncRoute, async (c) => {
  try {
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);
    
    if (!accountId || !apiToken) {
      return c.json({ success: false, error: 'Cloudflare credentials not configured' }, 500);
    }

    // [REST] const headers = {
    // [REST]   'Authorization': `Bearer ${apiToken}`,
    // [REST]   'Content-Type': 'application/json'
    // [REST] };

    // [REST] const workersRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, { headers });
    // [REST] const workersData = await workersRes.json() as any;
    
    // 2. Fetch Pages
    // [REST] const pagesRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, { headers });
    // [REST] const pagesData = await pagesRes.json() as any;

    const cfAny = getCfSdkClient(c.env as any, "workerAdmin") as any;
    const workersData = await cfAny.workers.scripts.list({ account_id: accountId });
    const pagesData = await cfAny.pages.projects.list({ account_id: accountId });

    const db = getDb(c.env.DB);
    let syncedCount = 0;

    // Existing apps for preserving summaries
    const existingApps = await db.select().from(schema.applications);
    const existingById = new Map(existingApps.map(a => [a.id, a]));

    const processApp = async (appId: string, appName: string, appType: 'worker' | 'pages', appDetails: any) => {
      const description = appType === 'pages' ? appDetails.source?.config?.production_branch : 'Worker script';
      const url = appType === 'pages' ? (appDetails.domains ? appDetails.domains[0] : null) : `${appName}.${accountId}.workers.dev`;
      const githubRepo = appType === 'pages' ? appDetails.source?.config?.repo_name : null;
      const lastDeployed = appType === 'pages' ? appDetails.latest_deployment?.created_on : appDetails.modified_on;
      
      // Preserve existing summary — AI will fill it in via cron or page load
      const existingSummary = existingById.get(appId)?.summary || null;

      await db.insert(schema.applications)
        .values({
          id: appId,
          name: appName,
          type: appType,
          url,
          githubRepo,
          description,
          summary: existingSummary,
          lastDeployedDate: lastDeployed ? new Date(lastDeployed) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.applications.id,
          set: {
            name: appName,
            url,
            githubRepo,
            lastDeployedDate: lastDeployed ? new Date(lastDeployed) : null,
            updatedAt: new Date(),
            // Never overwrite an existing summary — that's managed by AI cron/page-load
          },
        });

      syncedCount++;
    };

    if (workersData && Array.isArray(workersData)) {
      for (const worker of workersData) {
        await processApp(worker.id, worker.id, 'worker', worker);
      }
    }

    if (pagesData && Array.isArray(pagesData)) {
      for (const project of pagesData) {
        await processApp(project.name, project.name, 'pages', project);
      }
    }

    return c.json({ success: true, message: 'Sync complete (AI summaries generated via cron/page-load)', syncedCount }, 200);

  } catch (error: any) {
    console.error('Failed to sync app store:', error);
    return c.json({ success: false, error: error.message || "Unknown error" }, 500);
  }
});

export default app;
