/**
 * @file settings.ts
 * @description Unified endpoint for application configuration and user/organization settings.
 * Consolidates D1-backed golden-path configuration, KV-backed app settings, Cloudflare Secret Store management, and AI preferences.
 * Optimized for AI coding agents with block-level documentation and structured schemas.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { getDb } from "@db";
import { userSettings } from "@/db/schemas/app/settings";
import { configAuditLogs } from "@db/schemas/app/config";
import { systemConfigDefinitions, repositorySecretDefaults } from "@/db/schemas/app/standardization";
import { goldenPathConfig, goldenPathConfigScopes, goldenPathConfigTagDefinitions } from "@/db/schemas/app/golden_path";
import { zValidator } from "@hono/zod-validator";
import { getConfigManager } from "@/config-settings";
import { getSecretsStoreClient } from "@/utils/cloudflare/secret-store";
import { sanitizeForAudit } from "@lib/masking";
import { PostConfigSchema, PostConfigInput } from "@/types/config-schemas";
import { CreateSecretSchema } from "@db/schemas/ops/secrets";
import { isUuid } from "@/utils/common";
import {
  buildGoldenPathGroupedDefaults,
  createGoldenPathConfig,
  createGoldenPathScope,
  createGoldenPathTag,
  deleteGoldenPathConfig,
  deleteGoldenPathScope,
  deleteGoldenPathTag,
  listGoldenPathConfigs,
  listGoldenPathScopes,
  listGoldenPathTags,
  updateGoldenPathConfig,
  updateGoldenPathScope,
  updateGoldenPathTag,
} from "@/services/golden-path-config";
import {
  deactivateRepositorySecretDefault,
  listRepositorySecretDefaults,
  upsertRepositorySecretDefault,
} from "@/services/repository-secret-defaults";

const settingsApi = new Hono<{ Bindings: Env }>();
const DEFAULT_USER = "default-user";
const RepoSecretDefaultSchema = createInsertSchema(repositorySecretDefaults, {
  secretName: (s) => s.trim().min(1, "Secret name is required").regex(/^[A-Z][A-Z0-9_]*$/, "Secret name must be UPPERCASE_SNAKE_CASE"),
  description: (s) => s.trim().max(255).optional().nullable(),
}).pick({ secretName: true, description: true });

const GoldenPathConfigPayloadSchema = createInsertSchema(goldenPathConfig, {
  title: (s) => s.trim().min(1),
  description: (s) => s.trim().min(1),
  rule: (s) => s.trim().min(1),
  scopeId: z.coerce.number().int().positive() as any,
}).pick({ title: true, description: true, rule: true, scopeId: true });

const GoldenPathScopePayloadSchema = createInsertSchema(goldenPathConfigScopes, {
  title: (s) => s.trim().min(1),
  description: (s) => s.trim().min(1),
  infrastructure: (s) => s.trim().min(1),
  hexColor: (s) => s.trim().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/),
}).pick({ title: true, description: true, infrastructure: true, hexColor: true }).extend({
  tagIds: z.array(z.coerce.number().int().positive()).default([]),
});

const GoldenPathTagPayloadSchema = createInsertSchema(goldenPathConfigTagDefinitions, {
  name: (s) => s.trim().min(1),
  description: (s) => s.trim().min(1),
  hexColor: (s) => s.trim().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/),
}).pick({ name: true, description: true, hexColor: true, isActive: true });

// --- Helper Functions ---

function normalizeUserId(id?: string | null): string {
  return String(id || "").trim() || DEFAULT_USER;
}

function parseJson(raw: string | null | undefined): any {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}



// --- User & Org Settings Routes ---

/**
 * GET /
 * Retrieves global and user-specific AI settings.
 */
settingsApi.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const userId = normalizeUserId(c.req.query("userId") || c.req.header("x-user-id"));

  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  const settings = existing ? {
    ...existing,
    enforceGoldenPath: Boolean(existing.enforceGoldenPath),
    goldenPathOverrides: parseJson(existing.goldenPathOverridesJson)
  } : { userId, preferredProvider: "worker-ai", preferredModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", enforceGoldenPath: true, goldenPathOverrides: {} };

  const goldenPath = await buildGoldenPathGroupedDefaults(c.env);

  return c.json({ success: true, settings, goldenPath });
});

/**
 * PUT /
 * Updates or creates user settings.
 */
settingsApi.put("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as { 
    userId?: string; 
    preferredProvider?: string; 
    preferredModel?: string; 
    enforceGoldenPath?: boolean; 
    customInstructions?: string; 
    goldenPathOverrides?: Record<string, unknown>; 
  };
  const userId = normalizeUserId(body.userId || c.req.header("x-user-id"));
  const now = new Date().toISOString();

  const data = {
    userId,
    preferredProvider: body.preferredProvider || "worker-ai",
    preferredModel: body.preferredModel || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    enforceGoldenPath: body.enforceGoldenPath === false ? 0 : 1,
    customInstructions: body.customInstructions || null,
    goldenPathOverridesJson: JSON.stringify(body.goldenPathOverrides || {}),
    updatedAt: now
  };

  await db.insert(userSettings).values({ ...data, createdAt: now }).onConflictDoUpdate({ target: userSettings.userId, set: data });
  return c.json({ success: true, settings: { ...data, enforceGoldenPath: Boolean(data.enforceGoldenPath) } });
});

// --- D1 / KV / Secret Store Config Routes ---

/**
 * GET /config
 * Retrieves app settings plus D1-backed golden path and repository secret defaults.
 */
settingsApi.get("/config", async (c) => {
  const db = getDb(c.env.DB);
  const manager = getConfigManager(c);
  const settings = await manager.getAll();
  const rawFields = await db.select().from(systemConfigDefinitions).where(eq(systemConfigDefinitions.isActive, true));
  const repoSecretDefaults = await listRepositorySecretDefaults(c.env, { activeOnly: true });
  const goldenPath = await buildGoldenPathGroupedDefaults(c.env);
  return c.json({
    success: true,
    settings,
    configFields: rawFields,
    repoSecretDefaults,
    requiredSecrets: repoSecretDefaults.map((item) => item.secretName),
    goldenPath,
  });
});

/**
 * GET /golden-path/configs
 * Lists relational golden path config rows with scope and active tag payloads.
 */
settingsApi.get("/golden-path/configs", async (c) => {
    const items = await listGoldenPathConfigs(c.env, {
        search: c.req.query("search"),
        scopeTitle: c.req.query("scope"),
        infrastructure: c.req.query("infrastructure"),
        tagName: c.req.query("tag"),
    });
    return c.json({ success: true, items });
});

/**
 * POST /golden-path/configs
 * Creates a new golden path config row.
 */
settingsApi.post("/golden-path/configs", zValidator("json", GoldenPathConfigPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const item = await createGoldenPathConfig(c.env, input);
    return c.json({ success: true, item }, 201);
});

/**
 * PUT /golden-path/configs/:id
 * Updates a golden path config row.
 */
settingsApi.put("/golden-path/configs/:id", zValidator("json", GoldenPathConfigPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ success: false, error: "Invalid config id" }, 400);
    }

    await updateGoldenPathConfig(c.env, id, input);
    return c.json({ success: true });
});

/**
 * DELETE /golden-path/configs/:id
 * Deletes a golden path config row.
 */
settingsApi.delete("/golden-path/configs/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ success: false, error: "Invalid config id" }, 400);
    }

    await deleteGoldenPathConfig(c.env, id);
    return c.json({ success: true });
});

/**
 * GET /golden-path/scopes
 * Lists scopes with active tags.
 */
settingsApi.get("/golden-path/scopes", async (c) => {
    const items = await listGoldenPathScopes(c.env);
    return c.json({ success: true, items });
});

/**
 * POST /golden-path/scopes
 * Creates a golden path scope and optional tag mappings.
 */
settingsApi.post("/golden-path/scopes", zValidator("json", GoldenPathScopePayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const item = await createGoldenPathScope(c.env, input as any);
    return c.json({ success: true, item }, 201);
});

/**
 * PUT /golden-path/scopes/:id
 * Updates a golden path scope and replaces tag mappings.
 */
settingsApi.put("/golden-path/scopes/:id", zValidator("json", GoldenPathScopePayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ success: false, error: "Invalid scope id" }, 400);
    }

    await updateGoldenPathScope(c.env, id, input as any);
    return c.json({ success: true });
});

/**
 * DELETE /golden-path/scopes/:id
 * Deletes a golden path scope and its dependent configs/mappings.
 */
settingsApi.delete("/golden-path/scopes/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ success: false, error: "Invalid scope id" }, 400);
    }

    await deleteGoldenPathScope(c.env, id);
    return c.json({ success: true });
});

/**
 * GET /golden-path/tags
 * Lists tag definitions with optional search and active filtering.
 */
settingsApi.get("/golden-path/tags", async (c) => {
    const items = await listGoldenPathTags(c.env, {
        activeOnly: c.req.query("activeOnly") === "true",
        search: c.req.query("search"),
    });
    return c.json({ success: true, items });
});

/**
 * POST /golden-path/tags
 * Creates a tag definition.
 */
settingsApi.post("/golden-path/tags", zValidator("json", GoldenPathTagPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const item = await createGoldenPathTag(c.env, input);
    return c.json({ success: true, item }, 201);
});

/**
 * PUT /golden-path/tags/:id
 * Updates a tag definition.
 */
settingsApi.put("/golden-path/tags/:id", zValidator("json", GoldenPathTagPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ success: false, error: "Invalid tag id" }, 400);
    }

    await updateGoldenPathTag(c.env, id, input);
    return c.json({ success: true });
});

/**
 * DELETE /golden-path/tags/:id
 * Soft-deletes a tag definition by marking it inactive.
 */
settingsApi.delete("/golden-path/tags/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ success: false, error: "Invalid tag id" }, 400);
    }

    await deleteGoldenPathTag(c.env, id);
    return c.json({ success: true });
});

/**
 * GET /config/secrets/available
 * Lists secrets in Clouflare that are not yet mapped to internal configuration.
 */
settingsApi.get("/config/secrets/available", async (c) => {
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        const all = await cf.listSecrets(store.id);
        const current = await getConfigManager(c).getAll();
        const mappedIds = new Set(current.filter(cfg => cfg.isSecretStoreManaged).map(cfg => cfg.value));
        return c.json({ success: true, secrets: all.filter(s => !mappedIds.has(s.id)) });
    } catch (e) {
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500); 
    }
});

/**
 * GET /config/secrets/all
 * Lists all secrets currently provisioned in Cloudflare Secret Store.
 */
settingsApi.get("/config/secrets/all", async (c) => {
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        const secrets = await cf.listSecrets(store.id);
        return c.json({ success: true, secrets });
    } catch (e) {
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * POST /config/secrets/create
 * Creates a new secret in Cloudflare and registers it for default synchronization.
 */
settingsApi.post("/config/secrets/create", zValidator("json", CreateSecretSchema), async (c) => {
    const input = c.req.valid("json");
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        const cfSecret = await cf.createSecret(store.id, { name: input.name, text: input.value });
        const repoSecretDefault = await upsertRepositorySecretDefault(c.env, {
            secretName: input.name,
            description: input.description || null,
        });
        return c.json({ success: true, secret: cfSecret, repoSecretDefault });
    } catch (e) { 
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500); 
    }
});

/**
 * POST /config/repo-secret-defaults
 * Adds or re-activates a repository secret default managed by the frontend.
 */
settingsApi.post("/config/repo-secret-defaults", zValidator("json", RepoSecretDefaultSchema), async (c) => {
    const input = c.req.valid("json");
    try {
        const item = await upsertRepositorySecretDefault(c.env, input);
        return c.json({ success: true, item });
    } catch (e) {
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * DELETE /config/repo-secret-defaults/:secretName
 * Removes a repository secret default from the active sync set.
 */
settingsApi.delete("/config/repo-secret-defaults/:secretName", async (c) => {
    const secretName = c.req.param("secretName");
    if (!RepoSecretDefaultSchema.shape.secretName.safeParse(secretName).success) {
        return c.json({ success: false, error: "Invalid secret name" }, 400);
    }

    try {
        await deactivateRepositorySecretDefault(c.env, secretName);
        return c.json({ success: true, secretName });
    } catch (e) {
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * POST /config
 * Creates or updates a configuration entry, with optional Secret Store provisioning.
 */
settingsApi.post("/config", zValidator("json", PostConfigSchema as any), async (c) => {
    const input = c.req.valid("json") as PostConfigInput;
    const manager = getConfigManager(c);
    const db = getDb(c.env.DB);
    let finalValue = input.value;
    let metadata = {};

    try {
        if (input.isSecretStoreManaged && input.type === "secret") {
            const cf = await getSecretsStoreClient(c.env);
            const store = await cf.getDefaultStore();
            if (!isUuid(input.value)) {
                const cfSecret = await cf.createSecret(store.id, { name: input.secretName!, text: String(input.value) });
                finalValue = cfSecret.id;
            }
            metadata = { secretName: input.secretName, isSecretStoreManaged: true };
        }

        const oldRaw = await manager.get(input.key);
        await manager.set(input.key, { ...input, value: finalValue, ...metadata });

        await db.insert(configAuditLogs).values({
            key: input.key,
            oldValue: oldRaw != null ? sanitizeForAudit(input.key, String(oldRaw)) : "NEW",
            newValue: sanitizeForAudit(input.key, input.isSecretStoreManaged ? "SECRET_ID" : String(input.value)),
            category: input.category,
            changedBy: "admin_ui"
        });

        return c.json({ success: true, key: input.key });
    } catch (e) { 
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500); 
    }
});

export default settingsApi;