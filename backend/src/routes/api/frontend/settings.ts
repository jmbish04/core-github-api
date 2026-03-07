/**
 * @file settings.ts
 * @description Unified endpoint for application configuration and user/organization settings.
 * Consolidates KV-based configuration, Cloudflare Secret Store management, and AI preferences.
 * Optimized for AI coding agents with block-level documentation and structured schemas.
 */

import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@db";
import { userSettings } from "@/db/schemas/app/settings";
import { configAuditLogs } from "@db/schemas/app/config";
import { goldenPathConfig } from "@db/schemas/app/golden_path";
import { zValidator } from "@hono/zod-validator";
import { getConfigManager } from "@/config-settings";
import { getSecretsStoreClient } from "@/utils/cloudflare/secret-store";
import { sanitizeForAudit } from "@lib/masking";
import { PostConfigSchema } from "@lib/config-schemas";
import { CreateSecretSchema } from "@db/schemas/ops/secrets";
import { isUuid } from "@/utils/common";
import { REQUIRED_REPO_SECRETS } from "@/routes/api/webhooks/workflows/gardener";
import { GOLDEN_PATH_DEFAULTS, GOLDEN_PATH_SYSTEM_PROMPT } from "@/config/goldenPath";

const settingsApi = new Hono<{ Bindings: Env }>();
const DEFAULT_USER = "default-user";

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

  const dbGp = await db.select().from(goldenPathConfig).where(eq(goldenPathConfig.id, "default")).get();
  let defaults = GOLDEN_PATH_DEFAULTS;

  if (dbGp) {
    defaults = {
      frontend: (dbGp.frontend || []) as string[],
      backend: (dbGp.backend || []) as string[],
      ai: (dbGp.ai || []) as string[],
      infra: (dbGp.infra || []) as string[],
      docs: (dbGp.docs || []) as string[]
    };
  }

  return c.json({ success: true, settings, goldenPath: { defaults, systemPrompt: GOLDEN_PATH_SYSTEM_PROMPT } });
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

/**
 * PUT /golden-path
 * Updates the global golden path configuration in D1.
 */
settingsApi.put("/golden-path", async (c) => {
   const db = getDb(c.env.DB);
   const body = await c.req.json() as any;
   const now = new Date().toISOString();
   const defaults = body.defaults;

   if (!defaults) return c.json({ error: "Missing defaults" }, 400);

   await db.insert(goldenPathConfig).values({
     id: "default",
     frontend: JSON.stringify(defaults.frontend || []),
     backend: JSON.stringify(defaults.backend || []),
     ai: JSON.stringify(defaults.ai || []),
     infra: JSON.stringify(defaults.infra || []),
     docs: JSON.stringify(defaults.docs || []),
     updatedAt: now
   }).onConflictDoUpdate({
     target: goldenPathConfig.id,
     set: {
       frontend: JSON.stringify(defaults.frontend || []),
       backend: JSON.stringify(defaults.backend || []),
       ai: JSON.stringify(defaults.ai || []),
       infra: JSON.stringify(defaults.infra || []),
       docs: JSON.stringify(defaults.docs || []),
       updatedAt: now
     }
   });
   
   return c.json({ success: true, defaults });
});

// --- KV & Secret Store Config Routes ---

/**
 * GET /config
 * Retrieves all KV-based configuration and lists required secrets.
 */
settingsApi.get("/config", async (c) => {
  const manager = getConfigManager(c);
  const settings = await manager.getAll();
  return c.json({ success: true, settings, requiredSecrets: REQUIRED_REPO_SECRETS });
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
 * POST /config/secrets/create
 * Creates a new secret in Cloudflare and registers it for default synchronization.
 */
settingsApi.post("/config/secrets/create", zValidator("json", CreateSecretSchema), async (c) => {
    const input = c.req.valid("json");
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        const cfSecret = await cf.createSecret(store.id, { name: input.name, text: input.value });
        
        const manager = getConfigManager(c);
        const currentRaw = await manager.get("DEFAULT_SYNC_SECRETS");
        const list: string[] = Array.isArray(currentRaw) ? currentRaw.map(s => typeof s === 'string' ? s : s.name) : [];
        if (!list.includes(input.name)) {
            list.push(input.name);
            await manager.set("DEFAULT_SYNC_SECRETS", { key: "DEFAULT_SYNC_SECRETS", value: list, type: "json", category: "general" });
        }
        return c.json({ success: true, secret: cfSecret });
    } catch (e) { 
        const error = e as Error;
        return c.json({ success: false, error: error.message }, 500); 
    }
});

/**
 * POST /config
 * Creates or updates a configuration entry, with optional Secret Store provisioning.
 */
settingsApi.post("/config", zValidator("json", PostConfigSchema), async (c) => {
    const input = c.req.valid("json");
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
