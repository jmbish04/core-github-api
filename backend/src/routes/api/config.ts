import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PostConfigSchema } from "@lib/config-schemas";
import { getConfigManager } from "@/config-settings";
import { getSecretsStoreClient } from "@/utils/cloudflare/secret-store"; // Updated import
import { sanitizeForAudit } from "@lib/masking";
import { drizzle } from "drizzle-orm/d1";
import { configAuditLogs } from "@db/schemas/app/config";
import { desc } from "drizzle-orm";
import { isUuid } from "@/utils/common";
import { z } from "zod";

const CreateSecretSchema = z.object({
  name: z.string().min(1, "Name is required").regex(/^[a-zA-Z0-9_-]+$/, "Name must contain only letters, numbers, hyphens, and underscores"),
  value: z.string().min(1, "Value is required"),
  description: z.string().optional()
});

const app = new Hono<{ Bindings: Env }>();

/**
 * @openapi
 * /api/config:
 *   get:
 *     description: Retrieve all KV configuration settings
 *     responses:
 *       200:
 *         description: Success
 */
app.get("/", async (c) => {
  const manager = getConfigManager(c);
  const settings = await manager.getAll();
  return c.json({ success: true, settings });
});


/**
 * Get available secrets from Cloudflare (that aren't yet in KV as managed secrets)
 */
app.get("/secrets/available", async (c) => {
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        
        // Get all secrets from CF
        const allSecrets = await cf.listSecrets(store.id);
        
        const manager = getConfigManager(c);
        // Get current config to filter out already mapped secrets
        const currentConfig = await manager.getAll();
        const mappedSecretIds = new Set(
            currentConfig
                .filter(c => c.isSecretStoreManaged)
                .map(c => c.value) // value is the ID
        );

        const available = allSecrets.filter(s => !mappedSecretIds.has(s.id));

        return c.json({ success: true, secrets: available });
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});


/**
 * Get ALL secrets from Cloudflare Secrets Store
 */
app.get("/secrets/all", async (c) => {
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        
        // Get all secrets from CF without filtering
        const allSecrets = await cf.listSecrets(store.id);
        return c.json({ success: true, secrets: allSecrets });
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

/**
 * Create a new secret in Cloudflare and add to DEFAULT_SYNC_SECRETS
 */
app.post("/secrets/create", zValidator("json", CreateSecretSchema), async (c) => {
    const input = c.req.valid("json");
    try {
        const cf = await getSecretsStoreClient(c.env);
        const store = await cf.getDefaultStore();
        
        // 1. Create the secret in Cloudflare
        const cfSecret = await cf.createSecret(store.id, {
            name: input.name,
            text: input.value
        });
        
        // 2. Add to DEFAULT_SYNC_SECRETS
        const manager = getConfigManager(c);
        const currentListRaw = await manager.get("DEFAULT_SYNC_SECRETS");
        let currentList: string[] = [];
        if (Array.isArray(currentListRaw)) {
            currentList = currentListRaw.map((s: any) => typeof s === 'string' ? s : s.secretName || s.name);
        }
        
        if (!currentList.includes(input.name)) {
            currentList.push(input.name);
            await manager.set("DEFAULT_SYNC_SECRETS", {
                key: "DEFAULT_SYNC_SECRETS",
                value: currentList,
                type: "json",
                category: "general",
                isSecretStoreManaged: false
            }); 
        }
        
        return c.json({ success: true, secret: cfSecret });
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});


/**
 * Create or Update configuration
 */
app.post("/", zValidator("json", PostConfigSchema), async (c) => {
  const input = c.req.valid("json");
  const manager = getConfigManager(c);
  const db = drizzle(c.env.DB);
  
  let finalValue = input.value;
  let secretMetadata = {};

  try {
    // Phase 1: Cloudflare Secret Store Provisioning
    if (input.isSecretStoreManaged && input.type === "secret") {
       const cf = await getSecretsStoreClient(c.env);
       const store = await cf.getDefaultStore();
       
       if (!isUuid(input.value)) {
           // Create new secret
           const cfSecret = await cf.createSecret(store.id, {
               name: input.secretName!,
               text: String(input.value)
           });
           finalValue = cfSecret.id;
       } else {
           // It's already an ID
           finalValue = input.value;
       }

       secretMetadata = {
        secretName: input.secretName,
        isSecretStoreManaged: true
      };
    }

    // Fetch previous value for auditing BEFORE overwrite
    const previousRaw = await manager.get(input.key);
    const previousValue = previousRaw != null ? sanitizeForAudit(input.key, String(previousRaw)) : "N/A (new key)";

    // Phase 2: KV Persistence
    // IMPORTANT: If isSecretStoreManaged, result.value is the ID, NOT the secret text.
    // The plaintext secret is NEVER stored in KV.
    const configData = {
      ...input,
      value: finalValue, // ID or non-secret value
      ...secretMetadata
    };

    await manager.set(input.key, configData);

    // Phase 3: Auditing
    await db.insert(configAuditLogs).values({
      key: input.key,
      oldValue: previousValue, 
      newValue: sanitizeForAudit(input.key, input.isSecretStoreManaged ? "SECRET_ID_REF" : input.value), 
      category: input.category,
      changedBy: "admin_ui", 
    });

    return c.json({ 
      success: true, 
      key: input.key, 
      isSecretStoreManaged: input.isSecretStoreManaged 
    });

  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Delete configuration
 */
app.delete("/:key", async (c) => {
    const key = c.req.param("key");
    const manager = getConfigManager(c);
    const db = drizzle(c.env.DB);
    
    // Get old value for audit
    const oldValue = await manager.get(key);
    
    // Let's direct access KV for delete if manager doesn't support it, 
    // or better: extend ConfigManager.
    // I'll access KV directly via c.env.KV_CONFIGS since ConfigManager is a wrapper.
    await c.env.KV_CONFIGS.delete(key);
    
    // Audit
    await db.insert(configAuditLogs).values({
        key: key,
        oldValue: sanitizeForAudit(key, oldValue),
        newValue: "DELETED",
        category: "general", // We don't have category here easily, fallback
        changedBy: "admin_ui"
    });
    
    return c.json({ success: true, message: "Deleted" });
});

export default app;
