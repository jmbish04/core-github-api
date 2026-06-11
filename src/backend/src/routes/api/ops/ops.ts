import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { OpsVerificationService } from "@services/verification/ops";
import { buildRepositorySyncSecretPlanReport } from "@/services/repository-secret-defaults";
import { syncRepoSecrets } from "@services/github/secrets-manager";
import { HoniClient } from '@utils/honi-client';

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
  const { owner, repo, secrets } = c.req.valid("json");
  let secretsToSync = secrets || [];
  let missingSecretNames: string[] = [];

  if (!secrets || secrets.length === 0) {
        try {
          const plan = await buildRepositorySyncSecretPlanReport(c.env);
          secretsToSync = plan.secrets;
          missingSecretNames = plan.missingSecretNames;
        } catch (err: any) {
          return c.json({ success: false, error: "Failed to fetch default secrets: " + err.message }, 500);
        }
    }

    if (secretsToSync.length === 0) {
        return c.json({
          success: false,
          error: "No secrets provided and no defaults found.",
          missingDefaultSecrets: missingSecretNames,
        }, 400);
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
    const url = new URL(c.req.url);
    
    let path = url.pathname;
    if (path.includes(`/api/ops/${id}`)) {
         path = path.replace(`/api/ops/${id}`, '');
    }
    
    const newUrl = new URL(path, url.origin);
    newUrl.search = url.search;

    const headers: Record<string, string> = {};
    headers['x-operation-id'] = id;
    headers['x-forwarded-origin'] = url.origin;
    c.req.raw.headers.forEach((value, key) => headers[key] = value);

    return HoniClient.fetch(c.env.SUPERVISOR, id, newUrl.pathname + newUrl.search, {
      method: c.req.method,
      headers
    });
});

opsApi.all('/:id', async (c) => {
    const id = c.req.param('id');
    const newUrl = new URL('/status', c.req.url);
    newUrl.search = new URL(c.req.url).search;
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => headers[key] = value);

    return HoniClient.fetch(c.env.SUPERVISOR, id, newUrl.pathname + newUrl.search, {
      method: c.req.method,
      headers
    });
});

export default opsApi;
