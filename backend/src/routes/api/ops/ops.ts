import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { OpsVerificationService } from "@services/verification/ops";
import { getConfigManager } from "@/config-settings";
import { syncRepoSecrets } from "@services/github/secrets-manager";

const opsApi = new OpenAPIHono<{ Bindings: Env }>();

const VerificationSchema = z.object({
    owner: z.string(),
    repo: z.string()
});

const syncSecretsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  secrets: z.array(z.object({
    name: z.string(),
    value: z.string()
  })).optional(),
  force: z.boolean().default(false)
});

// --- 1. Verify MCP Config ---
opsApi.openapi(createRoute({
    method: 'post',
    path: '/verify/mcp-config',
    operationId: 'verifyMcpConfig',
    request: { body: { content: { 'application/json': { schema: VerificationSchema } } } },
    responses: {
        200: { description: 'Verification Result', content: { 'application/json': { schema: z.object({ success: z.boolean(), result: z.any().optional(), error: z.string().optional() }) } } }
    }
}), async (c) => {
    const { owner, repo } = c.req.valid('json');
    const result = await OpsVerificationService.verifyMcpConfig(c.env, owner, repo);
    return c.json(result);
});

// --- 2. Verify Secrets Sync ---
opsApi.openapi(createRoute({
    method: 'post',
    path: '/verify/secrets-sync',
    operationId: 'verifySecretsSync',
    request: { body: { content: { 'application/json': { schema: VerificationSchema } } } },
    responses: {
        200: { description: 'Verification Result', content: { 'application/json': { schema: z.object({ success: z.boolean(), result: z.any().optional(), error: z.string().optional() }) } } }
    }
}), async (c) => {
    const { owner, repo } = c.req.valid('json');
    const result = await OpsVerificationService.verifySecretsSync(c.env, owner, repo);
    return c.json(result);
});

// --- 3. Sync Secrets (Merged from legacy ops.ts) ---
opsApi.openapi(createRoute({
    method: 'post',
    path: '/secrets/sync',
    operationId: 'syncSecrets',
    request: { body: { content: { 'application/json': { schema: syncSecretsSchema } } } },
    responses: {
        200: { description: 'Sync Result', content: { 'application/json': { schema: z.object({ success: z.boolean(), results: z.any().optional(), error: z.string().optional() }) } } },
        400: { description: 'Bad Request' },
        500: { description: 'Internal Server Error' }
    }
}), async (c) => {
    const { owner, repo, secrets, force } = c.req.valid("json");
    let secretsToSync = secrets || [];

    if (!secrets || secrets.length === 0) {
        const configManager = getConfigManager(c);
        const configuredDefaultsRaw = await configManager.get("DEFAULT_SYNC_SECRETS");
        
        let defaultNames: string[] = [];
        if (Array.isArray(configuredDefaultsRaw)) {
            defaultNames = configuredDefaultsRaw.map((s: any) => typeof s === 'string' ? s : s.secretName || s.name);
        }
        
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
                      } catch (e) {}
                  }
                  return undefined;
              })
          );
          
          secretsToSync = fetchedSecrets.filter(s => !!s) as {name: string, value: string}[];
        } catch (err: any) {
          return c.json({ success: false, error: "Failed to fetch default secrets: " + err.message }, 500);
        }
    }

    if (secretsToSync.length === 0) {
        return c.json({ success: false, error: "No secrets provided and no defaults found." }, 400);
    }

    try {
        const results = await syncRepoSecrets(c.env, owner, repo, secretsToSync);
        return c.json({ success: true, results });
    } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500);
    }
});

// --- 4. Supervisor DO Forwarding ---
opsApi.all('/:id/*', async (c) => {
    const id = c.req.param('id');
    const doId = c.env.SUPERVISOR.idFromName(id);
    const stub = c.env.SUPERVISOR.get(doId);
    const url = new URL(c.req.url);
    
    let path = url.pathname;
    if (path.includes(`/api/ops/${id}`)) {
         path = path.replace(`/api/ops/${id}`, '');
    }
    
    const newUrl = new URL(path, url.origin);
    newUrl.search = url.search;

    const newReq = new Request(newUrl, c.req.raw);
    newReq.headers.set('x-operation-id', id);
    newReq.headers.set('x-forwarded-origin', url.origin);

    return stub.fetch(newReq);
});

opsApi.all('/:id', async (c) => {
    const id = c.req.param('id');
    const doId = c.env.SUPERVISOR.idFromName(id);
    const stub = c.env.SUPERVISOR.get(doId);
    const newUrl = new URL('/status', c.req.url);
    newUrl.search = new URL(c.req.url).search;
    return stub.fetch(new Request(newUrl, c.req.raw));
});

export default opsApi;
