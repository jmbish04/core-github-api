import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { OpsVerificationService } from "@services/verification/ops";
import { buildRepositorySyncSecretPlan } from "@/services/repository-secret-defaults";
import { syncRepoSecrets } from "@services/github/secrets-manager";
import { getAgentByName } from 'agents';

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

  if (!secrets || secrets.length === 0) {
        try {
          secretsToSync = await buildRepositorySyncSecretPlan(c.env);
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

// --- 4. Supervisor DO Forwarding via RPC ---
opsApi.get('/:id/health', async (c) => {
    const id = c.req.param('id');
    const agent = await getAgentByName(c.env.CLOUDFLARE_AGENT as any, id);
    const result = await (agent as any).healthProbe();
    return c.json(result);
});

opsApi.post('/:id/health/github', async (c) => {
    const id = c.req.param('id');
    const agent = await getAgentByName(c.env.CLOUDFLARE_AGENT as any, id);
    const result = await (agent as any).runGithubHealthCheck();
    return c.json(result);
});

opsApi.get('/:id', async (c) => {
    const id = c.req.param('id');
    const agent = await getAgentByName(c.env.CLOUDFLARE_AGENT as any, id);
    // Explicitly call the RPC method
    const result = await (agent as any).getStatus();
    return c.json(result);
});

export default opsApi;
