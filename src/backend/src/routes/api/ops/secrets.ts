import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { buildRepositorySyncSecretPlan } from "@/services/repository-secret-defaults";
import { syncRepoSecrets } from "@services/github/secrets-manager";
import { getGithubToken } from "@utils/secrets";

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
  
  let secretsToSync = secrets || [];

  if (!secrets || secrets.length === 0) {
    secretsToSync = await buildRepositorySyncSecretPlan(c.env);
  }

  if (secretsToSync.length === 0) {
    return c.json({ 
      success: false, 
      error: "No repository secret defaults resolved to values in the Worker environment." 
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
