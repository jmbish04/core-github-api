/**
 * @file standards.ts
 * @description Operational standards and engineering rule management.
 * Consolidates standardization rule CRUD, AI-powered rule analysis, and sync triggers (MCP/Secrets).
 * Optimized for AI coding agents with clear documentation and structured endpoints.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb } from '@db';
import { standardizationRules, standardizationItems, standardizationTagDefinitions, standardizationTagMappings } from '@db/schemas/app/standardization';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { McpSync } from "@/automations/repository/standardization/mcp";
import { SecretSync } from "@/automations/repository/standardization/secrets";
import { zValidator } from "@hono/zod-validator";
import { getOctokit } from '@services/octokit/core';
import { listActiveRepositorySecretNames } from '@/services/repository-secret-defaults';

const standardsApi = new OpenAPIHono<{ Bindings: Env }>();

// --- Types & Schemas ---

const RuleSchema = z.object({
    id: z.string(),
    sourceRepo: z.string(),
    filePath: z.string(),
    description: z.string().nullable(),
    relevantInfra: z.array(z.string()),
    irrelevantInfra: z.array(z.string()),
    aiInstructions: z.string().nullable(),
    shouldOverwrite: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string()
});

const CreateRuleSchema = RuleSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({
    sourceRepo: true, relevantInfra: true, irrelevantInfra: true, shouldOverwrite: true
});

// --- Helper Functions ---

function safeJsonParse(val: string, fallback: unknown[] = []): unknown {
    try { return JSON.parse(val); } catch { return fallback; }
}

// --- Rule Management Routes (Legacy Standardization) ---

/**
 * GET /rules
 * Lists all active engineering standardization rules.
 */
standardsApi.openapi(createRoute({
    method: 'get', path: '/rules',
    responses: { 200: { content: { 'application/json': { schema: z.array(RuleSchema) } }, description: 'Rules list' } }
}), async (c) => {
    const rules = await getDb(c.env.DB).select().from(standardizationRules).all();
    return c.json(rules.map(r => ({ ...r, relevantInfra: safeJsonParse(r.relevantInfra) as string[], irrelevantInfra: safeJsonParse(r.irrelevantInfra) as string[], shouldOverwrite: Boolean(r.shouldOverwrite) })));
});

/**
 * POST /rules
 * Registers a new standardization rule from a repository source.
 */
standardsApi.openapi(createRoute({
    method: 'post', path: '/rules',
    request: { body: { content: { 'application/json': { schema: CreateRuleSchema } } } },
    responses: { 201: { content: { 'application/json': { schema: RuleSchema } }, description: 'Rule created' } }
}), async (c) => {
    const body = await c.req.json();
    const now = new Date().toISOString();
    const rule = { id: uuidv4(), sourceRepo: body.sourceRepo || '', filePath: body.filePath, description: body.description || null, relevantInfra: JSON.stringify(body.relevantInfra || []), irrelevantInfra: JSON.stringify(body.irrelevantInfra || []), aiInstructions: body.aiInstructions || null, shouldOverwrite: body.shouldOverwrite ?? false, createdAt: now, updatedAt: now };
    await getDb(c.env.DB).insert(standardizationRules).values(rule).run();
    return c.json({ ...rule, relevantInfra: safeJsonParse(rule.relevantInfra) as string[], irrelevantInfra: safeJsonParse(rule.irrelevantInfra) as string[], shouldOverwrite: Boolean(rule.shouldOverwrite) }, 201);
});

// --- Sync Triggers (Legacy Standards) ---

/**
 * GET /config
 * Returns current standardization configuration and sync intentions.
 */
standardsApi.get("/config", async (c) => {
    const available = await listActiveRepositorySecretNames(c.env);
    return c.json({
      mcp: { masterRepo: `${c.env.GITHUB_OWNER}/${c.env.STANDARDIZATION_REPO_NAME}`, masterPath: "mcp.json" },
      secrets: { available },
    });
});

/**
 * POST /refresh-mcp
 * Forces an asynchronous synchronization of mcp.json for a specific repository.
 */
standardsApi.post("/refresh-mcp", zValidator("json", z.object({ owner: z.string(), repo: z.string() })), async (c) => {
    const { owner, repo } = c.req.valid("json");
    c.executionCtx.waitUntil((async () => {
        const octokit = await getOctokit(c.env);
        await McpSync.syncMcpConfig(c.env, owner, repo, octokit);
    })());
    return c.json({ success: true, message: `Queued MCP sync for ${owner}/${repo}` });
});

/**
 * POST /secrets/sync
 * Manually triggers secret auto-provisioning for a repository.
 */
standardsApi.post("/secrets/sync", zValidator("json", z.object({ owner: z.string(), repo: z.string() })), async (c) => {
    const { owner, repo } = c.req.valid("json");
    c.executionCtx.waitUntil((async () => {
        const octokit = await getOctokit(c.env);
        await SecretSync.autoProvisionSecrets(c.env, owner, repo, octokit);
    })());
    return c.json({ success: true, message: `Queued Secret sync for ${owner}/${repo}` });
});

// --- Modern Standardization System Routes ---

const TagSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  hexColor: z.string().default('#808080'),
  isActive: z.boolean().default(true)
});

const ItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  rule: z.string(),
  isActive: z.boolean().default(true),
  tagIds: z.array(z.string()).optional()
});

standardsApi.openapi(createRoute({
  method: 'get', path: '/tags',
  responses: { 200: { content: { 'application/json': { schema: z.any() } }, description: 'Tags list' } }
}), async (c) => {
  const db = getDb(c.env.DB);
  const tags = await db.select().from(standardizationTagDefinitions).where(eq(standardizationTagDefinitions.isActive, true)).all();
  return c.json(tags);
});

standardsApi.openapi(createRoute({
  method: 'post', path: '/tags',
  request: { body: { content: { 'application/json': { schema: TagSchema } } } },
  responses: { 201: { content: { 'application/json': { schema: z.any() } }, description: 'Tag created' } }
}), async (c) => {
  const body = await c.req.json();
  const id = body.id || crypto.randomUUID();
  await getDb(c.env.DB).insert(standardizationTagDefinitions).values({
    id, name: body.name, description: body.description || null, hexColor: body.hexColor, isActive: body.isActive
  }).run();
  return c.json({ id, ...body }, 201);
});

standardsApi.openapi(createRoute({
  method: 'put', path: '/tags/{id}',
  request: { params: z.object({ id: z.string() }), body: { content: { 'application/json': { schema: TagSchema } } } },
  responses: { 200: { content: { 'application/json': { schema: z.any() } }, description: 'Tag updated' } }
}), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  await getDb(c.env.DB).update(standardizationTagDefinitions).set({
    name: body.name, description: body.description || null, hexColor: body.hexColor, isActive: body.isActive
  }).where(eq(standardizationTagDefinitions.id, id)).run();
  return c.json({ id, ...body }, 200);
});

standardsApi.openapi(createRoute({
  method: 'get', path: '/items',
  responses: { 200: { content: { 'application/json': { schema: z.any() } }, description: 'Items list' } }
}), async (c) => {
  const db = getDb(c.env.DB);
  const items = await db.select().from(standardizationItems).where(eq(standardizationItems.isActive, true)).all();
  const mappings = await db.select().from(standardizationTagMappings).all();
  const tags = await db.select().from(standardizationTagDefinitions).all();

  const results = items.map(item => {
    const itemMappings = mappings.filter(m => m.standardizationItemId === item.id);
    const itemTags = itemMappings.map(m => tags.find(t => t.id === m.tagId)).filter(Boolean);
    return { ...item, tags: itemTags };
  });

  return c.json(results);
});

standardsApi.openapi(createRoute({
  method: 'post', path: '/items',
  request: { body: { content: { 'application/json': { schema: ItemSchema } } } },
  responses: { 201: { content: { 'application/json': { schema: z.any() } }, description: 'Item created' } }
}), async (c) => {
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  const id = body.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(standardizationItems).values({
    id, title: body.title, rule: body.rule, timestampCreated: now, timestampModified: now, isActive: body.isActive
  }).run();

  if (body.tagIds && Array.isArray(body.tagIds)) {
    for (const tagId of body.tagIds) {
      await db.insert(standardizationTagMappings).values({
        id: crypto.randomUUID(),
        standardizationItemId: id,
        tagId
      }).run();
    }
  }

  return c.json({ id, ...body }, 201);
});

standardsApi.openapi(createRoute({
  method: 'put', path: '/items/{id}',
  request: { params: z.object({ id: z.string() }), body: { content: { 'application/json': { schema: ItemSchema } } } },
  responses: { 200: { content: { 'application/json': { schema: z.any() } }, description: 'Updated' } }
}), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  await db.update(standardizationItems).set({
    title: body.title, rule: body.rule, timestampModified: now, isActive: body.isActive,
    timestampInactive: body.isActive === false ? now : null
  }).where(eq(standardizationItems.id, id)).run();

  if (body.tagIds && Array.isArray(body.tagIds)) {
    await db.delete(standardizationTagMappings).where(eq(standardizationTagMappings.standardizationItemId, id)).run();
    for (const tagId of body.tagIds) {
      await db.insert(standardizationTagMappings).values({
        id: crypto.randomUUID(),
        standardizationItemId: id,
        tagId
      }).run();
    }
  }
  return c.json({ id, ...body });
});

export default standardsApi;
