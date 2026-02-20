import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb, schema } from '@db';
import { eq, inArray } from 'drizzle-orm';
import { analyzeApplication } from '@/services/appstore-ai';
import { generateUuid } from '@/utils/common';
import { getCloudflareApiToken, getCloudflareAccountId } from '@/utils/secrets';

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

const getAppsRoute = createRoute({
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

  return c.json({ success: true, applications: resultApps }, 200);
});

const syncRoute = createRoute({
  method: 'post',
  path: '/sync',
  summary: 'Sync applications and tags from Cloudflare API',
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

    const headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    };

    // 1. Fetch Workers
    const workersRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, { headers });
    const workersData = await workersRes.json() as any;
    
    // 2. Fetch Pages
    const pagesRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, { headers });
    const pagesData = await pagesRes.json() as any;

    const db = getDb(c.env.DB);
    let syncedCount = 0;

    // Existing apps to check if they are new or not (for skipping AI if already summarized)
    const existingApps = await db.select().from(schema.applications);
    const existingAppIds = new Set(existingApps.map(a => a.id));

    // Existing tags for AI
    const tagsList = await db.select().from(schema.tags);
    let currentTagsByName = new Map(tagsList.map(t => [t.name.toLowerCase(), t]));

    const processApp = async (appId: string, appName: string, appType: 'worker' | 'pages', appDetails: any) => {
      let description = appType === 'pages' ? appDetails.source?.config?.production_branch : 'Worker script';
      let url = appType === 'pages' ? (appDetails.domains ? appDetails.domains[0] : null) : `${appName}.${accountId}.workers.dev`;
      let githubRepo = appType === 'pages' ? appDetails.source?.config?.repo_name : null;
      let lastDeployed = appType === 'pages' ? appDetails.latest_deployment?.created_on : appDetails.modified_on;
      
      let summary = null;
      let aiResult = null;

      // Only run AI if it's a newer app (to save budget and time), or we can force it
      if (!existingAppIds.has(appId)) {
        try {
          const tagsForAi = Array.from(currentTagsByName.values()).map(t => ({ name: t.name, description: t.description }));
          aiResult = await analyzeApplication(c.env, appName, appType, description, tagsForAi);
          summary = aiResult.summary;
        } catch (err) {
          console.error(`Failed to run AI analysis for ${appName}:`, err);
        }
      }

      await db.insert(schema.applications)
        .values({
          id: appId,
          name: appName,
          type: appType,
          url: url,
          githubRepo: githubRepo,
          description: description,
          summary: summary || existingApps.find(a => a.id === appId)?.summary || null,
          lastDeployedDate: lastDeployed ? new Date(lastDeployed) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.applications.id,
          set: {
            name: appName,
            url: url,
            githubRepo: githubRepo,
            lastDeployedDate: lastDeployed ? new Date(lastDeployed) : null,
            updatedAt: new Date(),
            // Don't overwrite summary if we didn't generate a new one
            summary: summary || existingApps.find(a => a.id === appId)?.summary || null,
          },
        });

      if (aiResult) {
        // Handle new tags
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
            
            // Re-fetch tags to maintain sync
            const latestTags = await db.select().from(schema.tags);
            currentTagsByName = new Map(latestTags.map(t => [t.name.toLowerCase(), t]));
          }
        }
        
        // Map assigned tags
        for (const tagName of aiResult.assigned_tag_names) {
          const tag = currentTagsByName.get(tagName.toLowerCase());
          if (tag) {
             await db.insert(schema.tagApplicationMapping).values({
               appId: appId,
               tagId: tag.id,
             }).onConflictDoNothing();
          }
        }
        
        // Map any newly created tags that matched
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

      syncedCount++;
    };

    if (workersData.success && workersData.result) {
      for (const worker of workersData.result) {
        await processApp(worker.id, worker.id, 'worker', worker); // using worker.id as name/id, some endpoints don't expose unique name vs id separately well
      }
    }

    if (pagesData.success && pagesData.result) {
      for (const project of pagesData.result) {
        // pages API uses project name
        await processApp(project.name, project.name, 'pages', project);
      }
    }

    return c.json({ success: true, message: 'Sync complete', syncedCount }, 200);

  } catch (error: any) {
    console.error('Failed to sync app store:', error);
    return c.json({ success: false, error: error.message || "Unknown error" }, 500);
  }
});

export default app;
