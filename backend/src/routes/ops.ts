
import { Hono } from "hono";
import { getConfigManager } from "@/config-settings";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { syncRepoSecrets } from "../services/github/secrets-manager";


const app = new Hono<{ Bindings: Env }>();

const syncSecretsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  secrets: z.array(z.object({
    name: z.string(),
    value: z.string()
  })).optional(), // If not provided, uses defaults from Env
  force: z.boolean().default(false)
});

app.post("/secrets/sync", zValidator("json", syncSecretsSchema), async (c) => {
  const { owner, repo, secrets, force } = c.req.valid("json");
  
  // If secrets are provided, use them.
  // Otherwise, fallback to a standard set of default secrets from the worker Env.
  // In a real scenario, you might want to select WHICH defaults to apply.
  // For now, let's assume we want to sync the minimal set required for our agents.
  
  let secretsToSync = secrets || [];

  if (!secrets || secrets.length === 0) {
    const configManager = getConfigManager(c);
    const configuredDefaultsRaw = await configManager.get("DEFAULT_SYNC_SECRETS");
    
    let defaultNames: string[] = [];
    if (Array.isArray(configuredDefaultsRaw)) {
        defaultNames = configuredDefaultsRaw.map((s: any) => typeof s === 'string' ? s : s.secretName || s.name);
    }
    
    // If no defaults are configured at all, fallback to a sensible initial list
    if (defaultNames.length === 0) {
        defaultNames = [
          "WORKER_API_KEY",
          "OPENAI_API_KEY",
          "ANTHROPIC_API_KEY",
          "GEMINI_API_KEY",
          "AI_GATEWAY_TOKEN",
          "CLOUDFLARE_API_TOKEN",
          "CLOUDFLARE_ACCOUNT_ID"
        ];
    }

    try {
      const { getSecretsStoreClient } = await import("@/utils/cloudflare/secret-store");
      const client = await getSecretsStoreClient(c.env);
      const store = await client.getDefaultStore();
      const availableSecrets = await client.listSecrets(store.id);

      const fetchedSecrets = await Promise.all(
          defaultNames.map(async (name) => {
              const found = availableSecrets.find((s: any) => s.name === name);
              if (found) {
                  try {
                      const value = await client.getSecretValue(store.id, found.id);
                      if (value) return { name, value };
                  } catch (e) {
                      // ignore individual fetch errors
                  }
              }
              return undefined;
          })
      );
      
      secretsToSync = fetchedSecrets.filter(s => !!s) as {name: string, value: string}[];
    } catch (err: any) {
      return c.json({ 
        success: false, 
        error: "Failed to fetch default secrets from Cloudflare Secrets Store: " + err.message 
      }, 500);
    }
  }

  if (secretsToSync.length === 0) {
    return c.json({ 
      success: false, 
      error: "No secrets provided and no default environment variables found to sync." 
    }, 400);
  }

  try {
    const results = await syncRepoSecrets(c.env, owner, repo, secretsToSync);
    return c.json({ success: true, results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
