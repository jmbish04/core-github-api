/**
 * @file standards.ts
 * @description Operational standards and engineering rule management.
 * Consolidates standardization rule CRUD, AI-powered rule analysis, and sync triggers (MCP/Secrets).
 * Optimized for AI coding agents with clear documentation and structured endpoints.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb } from '@db';
import { standardizationRules } from '@db/schemas/app/standardization';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getOctokit } from '@/services/octokit/core';
import { McpSync } from "@services/standardization/mcp-sync";
import { SecretSync } from "@services/standardization/secret-sync";
import { zValidator } from "@hono/zod-validator";

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

function safeJsonParse(val: string, fallback: any[] = []): any {
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
    return c.json(rules.map(r => ({ ...r, relevantInfra: safeJsonParse(r.relevantInfra), irrelevantInfra: safeJsonParse(r.irrelevantInfra), shouldOverwrite: Boolean(r.shouldOverwrite) })));
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
    const rule = { id: uuidv4(), sourceRepo: body.sourceRepo || 'jmbish04/core-github-standardization', filePath: body.filePath, description: body.description || null, relevantInfra: JSON.stringify(body.relevantInfra || []), irrelevantInfra: JSON.stringify(body.irrelevantInfra || []), aiInstructions: body.aiInstructions || null, shouldOverwrite: body.shouldOverwrite ?? false, createdAt: now, updatedAt: now };
    await getDb(c.env.DB).insert(standardizationRules).values(rule).run();
    return c.json({ ...rule, relevantInfra: safeJsonParse(rule.relevantInfra), irrelevantInfra: safeJsonParse(rule.irrelevantInfra), shouldOverwrite: Boolean(rule.shouldOverwrite) }, 201);
});

// --- Sync Triggers (Legacy Standards) ---

/**
 * GET /config
 * Returns current standardization configuration and sync intentions.
 */
standardsApi.get("/config", async (c) => {
    return c.json({ mcp: { masterRepo: `${c.env.GITHUB_OWNER}/${c.env.STANDARDIZATION_REPO_NAME}`, masterPath: "mcp.json" }, secrets: { available: ["WORKER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"] } });
});

/**
 * POST /refresh-mcp
 * Forces an asynchronous synchronization of mcp.json for a specific repository.
 */
standardsApi.post("/refresh-mcp", zValidator("json", z.object({ owner: z.string(), repo: z.string() })), async (c) => {
    const { owner, repo } = c.req.valid("json");
    c.executionCtx.waitUntil(McpSync.syncMcpConfig(c.env, owner, repo));
    return c.json({ success: true, message: `Queued MCP sync for ${owner}/${repo}` });
});

/**
 * POST /secrets/sync
 * Manually triggers secret auto-provisioning for a repository.
 */
standardsApi.post("/secrets/sync", zValidator("json", z.object({ owner: z.string(), repo: z.string() })), async (c) => {
    const { owner, repo } = c.req.valid("json");
    c.executionCtx.waitUntil(SecretSync.autoProvisionSecrets(c.env, owner, repo));
    return c.json({ success: true, message: `Queued Secret sync for ${owner}/${repo}` });
});

export default standardsApi;
