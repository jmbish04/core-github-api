import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { syncRepoSecrets } from "@services/github/secrets-manager";
import { getConfigManager } from "@/config-settings";
import { getWorkerApiKey, getGithubToken } from "@utils/secrets";

const app = new Hono<{ Bindings: Env }>();

const syncSecretsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  secrets: z.array(z.object({
    name: z.string(),
    value: z.string()
  })).optional(),
  force: z.boolean().default(false)
});

app.post("/sync", zValidator("json", syncSecretsSchema), async (c) => {
  const { owner, repo, secrets, force } = c.req.valid("json");
  const config = getConfigManager(c);
  
  let secretsToSync = secrets || [];

  if (!secrets || secrets.length === 0) {
    // 1. Fetch the list of secrets to sync from KV Config
    // We expect this to be a JSON array of strings (names of env vars) or objects
    const defaultSyncListRaw = await config.get("DEFAULT_SYNC_SECRETS");
    
    let defaultKeys: string[] = [];
    
    if (Array.isArray(defaultSyncListRaw)) {
        // Handle both simple strings and object formats if schema evolved
        defaultKeys = defaultSyncListRaw.map((s: any) => typeof s === 'string' ? s : s.secretName || s.name);
    } else {
        // Fallback defaults if not configured
        defaultKeys = [
            "WORKER_API_KEY",
            "OPENAI_API_KEY", 
            "ANTHROPIC_API_KEY", 
            "GEMINI_API_KEY"
        ];
    }

    // 2. Resolve values from Env
    // We can only sync secrets that are actually bound to this worker
    const resolvedSecrets: { name: string; value: string }[] = [];
    for (const key of defaultKeys) {
        // Try to get from Env
        let value = (c.env as any)[key];
        
        // Handle SecretsStoreSecret or specific getters
        if (key === 'WORKER_API_KEY') value = await getWorkerApiKey(c.env);
        else if (key === 'GITHUB_TOKEN') value = await getGithubToken(c.env);
        else if (value && typeof value === 'object' && 'get' in value) {
            value = await value.get();
        }
        
        if (value) {
            resolvedSecrets.push({ name: key, value: String(value) });
        }
    }
    
    secretsToSync = resolvedSecrets;
  }

  if (secretsToSync.length === 0) {
    return c.json({ 
      success: false, 
      error: "No secrets found in Environment to sync (checked DEFAULT_SYNC_SECRETS)." 
    }, 400);
  }

  try {
    // Ensure GitHub Token is available
    const githubToken = await getGithubToken(c.env);
    if (!githubToken) {
         return c.json({ success: false, error: "GITHUB_TOKEN not configured" }, 500);
    }
    
    const results = await syncRepoSecrets({ ...c.env, GITHUB_TOKEN: githubToken} as any, owner, repo, secretsToSync);
    return c.json({ success: true, results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
