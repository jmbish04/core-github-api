import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { mountRoutes } from '@/routes';
import { mountMcpEndpoints } from '@/ai/mcp';
import { Logger } from '@/lib/logger';
import { proxyToSandbox } from '@cloudflare/sandbox';
import { routeAgentRequest } from 'agents';
import { registerObservability } from '@/ai/providers';

export { Sandbox } from '@cloudflare/sandbox';

// ---------------------------------------------------------------------------
// Scalar API Reference renderer
// ---------------------------------------------------------------------------
function renderScalarReference(specUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Codex MCP Orchestrator API Reference</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${specUrl}"
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
    ></script>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Hono App & OpenAPI
// ---------------------------------------------------------------------------
const app = new OpenAPIHono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  // Try proxyToSandbox first for preview URLs (e.g. from Wrangler Dev)
  // We alias the binding because getSandbox expects `env.Sandbox` but our wrangler.jsonc provides `SANDBOX`
  const proxyResponse = await proxyToSandbox(c.req.raw, { Sandbox: (c.env as any).SANDBOX } as any);
  if (proxyResponse) return proxyResponse;
  await next();
});

// ---------------------------------------------------------------------------
// Global Logger Middleware — flushes buffered logs to D1 after every request.
// Uses waitUntil so the flush doesn't block the response.
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  // V8-02: Register observability channel subscribers (idempotent)
  registerObservability(c.env);

  const logger = new Logger(c.env, 'request');
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;

  logger.info(`${method} ${path}`);

  try {
    await next();
  } catch (err: any) {
    logger.error(`Unhandled error on ${method} ${path}: ${err.message}`);
    throw err;
  } finally {
    // Flush logs to D1 without blocking the response
    c.executionCtx.waitUntil(logger.flush());
  }
});


app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Codex MCP Orchestrator API',
    version: '1.0.0',
    description: 'Remote MCP Server utilizing the Cloudflare Agents SDK runtime',
  },
});

app.get('/swagger', swaggerUI({ url: '/openapi.json' }));
app.get('/scalar', (c) => c.html(renderScalarReference('/openapi.json')));
app.get('/scaler', (c) => c.html(renderScalarReference('/openapi.json')));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export const routes = mountRoutes(app);
export type AppType = typeof routes;

// ---------------------------------------------------------------------------
// Operational Endpoints
// ---------------------------------------------------------------------------
app.get('/context', (c) => c.json({ environment: 'production', transport: 'streamable-http' }));
app.get('/docs', (c) => c.redirect('/scalar'));

// ---------------------------------------------------------------------------
// MCP Endpoints (Jules + Stitch)
// ---------------------------------------------------------------------------
mountMcpEndpoints(app);

// ---------------------------------------------------------------------------
// Agent SDK Routing — delegates /agents/:name/:room to the correct DO
// ---------------------------------------------------------------------------
app.all('/agents/*', async (c) => {
  const response = await routeAgentRequest(c.req.raw, c.env);
  if (response) return response;
  return c.json({ error: 'Agent not found' }, 404);
});

// ---------------------------------------------------------------------------
// Fallback → Astro static assets
// ---------------------------------------------------------------------------
app.notFound(async (c) => {
  console.log("Hono 404 fallback invoked for:", c.req.method, c.req.url);
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    // First, try serving static assets (CSS, JS, images) from the ASSETS binding.
    // These live in public/client/ (built by Astro).
    const assetRes = await c.env.ASSETS.fetch(c.req.raw);
    if (assetRes.status !== 404) {
      return assetRes;
    }

    // If no static asset matched, delegate to the Astro SSR entry
    // which server-renders pages on demand (no static index.html exists).
    try {
      // @ts-expect-error — Astro SSR entry is a generated build artifact without type declarations
      const astroEntry = await import('../../../public/server/entry.mjs');
      const astroHandler = astroEntry.default;
      // The Astro Cloudflare adapter exports a Worker-compatible default export
      // with a `fetch` method that accepts (request, env, ctx).
      if (astroHandler && typeof astroHandler.fetch === 'function') {
        return astroHandler.fetch(c.req.raw, c.env, c.executionCtx);
      }
    } catch (e) {
      console.error("[Astro SSR] Failed to render page:", e);
    }

    // Ultimate fallback: SPA-style redirect to root
    const url = new URL(c.req.url);
    url.pathname = '/';
    const fallbackRes = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw as RequestInit));
    return fallbackRes;
  }

  return c.json({ error: 'Not found', path: c.req.url }, 404);
});

export default app;

// ---------------------------------------------------------------------------
// DO / Workflow / Sandbox re-exports (required by wrangler)
// ---------------------------------------------------------------------------
export * from './exports';
