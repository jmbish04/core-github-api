import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { OpsVerificationService } from "@services/verification/ops";

const opsApi = new OpenAPIHono<{ Bindings: Env }>();

const VerificationSchema = z.object({
    owner: z.string(),
    repo: z.string()
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

// --- 3. Supervisor DO Forwarding ---

// All routes under /api/ops/:id/... are forwarded to the Supervisor DO
opsApi.all('/:id/*', async (c) => {
    const id = c.req.param('id');
    const doId = c.env.SUPERVISOR.idFromName(id);
    const stub = c.env.SUPERVISOR.get(doId);

    // We strip the /api/ops/:id prefix to forward a cleaner URL to the DO
    // e.g. /api/ops/123/websocket -> /websocket
    //      /api/ops/123/chat -> /chat
    // Note: The router is mounted at /api/ops in index.ts, so c.req.path is /:id/* or /verify/* (relative to app)
    // Actually, in Hono `app.route('/api/ops', opsApi)`, the sub-app sees path relative to mount?
    // Let's rely on standard URL parsing to be safe.
    
    const url = new URL(c.req.url); // Use full URL
    // If mounted at /api/ops, path is /api/ops/123/foo
    // We want /foo forwarded to DO? Or /api/ops/123/foo -> /foo?
    // User snippet: path = url.pathname.replace(`/api/ops/${id}`, '')
    
    // Safety check for mount path
    let path = url.pathname;
    if (path.includes(`/api/ops/${id}`)) {
         path = path.replace(`/api/ops/${id}`, '');
    }
    
    const newUrl = new URL(path, url.origin); // keep origin, change path
    newUrl.search = url.search; // keep query params

    const newReq = new Request(newUrl, c.req.raw);
    newReq.headers.set('x-operation-id', id);
    newReq.headers.set('x-forwarded-origin', url.origin);

    return stub.fetch(newReq);
});

// Also handle the exact root /api/ops/:id (e.g. for status check default)
opsApi.all('/:id', async (c) => {
    const id = c.req.param('id');
    const doId = c.env.SUPERVISOR.idFromName(id);
    const stub = c.env.SUPERVISOR.get(doId);

    // Forward as /status by default or let DO handle root
    // User snippet: newUrl = new URL('/status', c.req.url)
    // If we assume DO expects /status for root access
    const newUrl = new URL('/status', c.req.url);
    newUrl.search = new URL(c.req.url).search;
    
    return stub.fetch(new Request(newUrl, c.req.raw));
});


export default opsApi;
