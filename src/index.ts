/**
 * @file src/index.ts
 * @description This is the main entry point for the Cloudflare Worker.
 * @owner AI-Builder
*/

import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
// 'app' is the Hono app that handles all our API routes
import { app, Bindings } from './utils/hono'
import { GitHubWorkerRPC } from './rpc'
import { convertOpenAPIToYAML, buildCompleteOpenAPIDocument } from './utils/openapi'
import { MCP_TOOLS, getToolStats, getTool, MCPExecuteRequest, TOOL_ROUTES, serializeTools } from './mcp/tools'
import { getDb, schema } from './db'
import { eq, and, desc } from 'drizzle-orm'

// Import routes
import octokitApi from './octokit'
import toolsApi from './tools'
import agentsApi from './routes/api/agents'
import retrofitApi from './retrofit'
import flowsApi from './flows'
import { webhookHandler } from './routes/webhook-handler'
import { healthHandler } from './routes/health'
import opsApi from './routes/api/ops'
import tasksApi from './routes/api/tasks'
import statsApi from './routes/api/stats'
import timelineApi from './routes/api/timeline'
import landingGeneratorApi from './routes/api/landing-generator'
import webhooksApi from './routes/api/webhooks'
import browserRender from './services/browser_render'


// --- 1. Middleware ---

// Logging middleware
app.use('*', async (c, next) => {
  const startTime = Date.now()
  const correlationId = c.req.header('X-Correlation-ID') || crypto.randomUUID()

  await next()

  c.res.headers.set('X-Correlation-ID', correlationId)
  const endTime = Date.now()
  const latency = endTime - startTime
  const payloadSizeHeader = c.req.header('content-length') || '0'
  const payloadSizeBytes = Number.parseInt(payloadSizeHeader, 10) || 0
  const logEntry = {
    level: 'info' as const,
    message: `[route] ${c.req.method} ${c.req.path}`,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    latency,
    payloadSizeBytes,
    correlationId,
    timestamp: new Date().toISOString(),
  }

  console.log(
    JSON.stringify({
      ...logEntry,
      latency: `${latency}ms`,
      payloadSize: `${payloadSizeBytes} bytes`,
    })
  )

  const db = getDb(c.env.DB)
  // Fire and forget insert to not block the response
  c.executionCtx.waitUntil(
    db.insert(schema.requestLogs).values({
      timestamp: logEntry.timestamp,
      level: logEntry.level,
      message: logEntry.message,
      method: logEntry.method,
      path: logEntry.path,
      status: logEntry.status,
      latencyMs: logEntry.latency,
      payloadSizeBytes: logEntry.payloadSizeBytes,
      correlationId: logEntry.correlationId,
      metadata: JSON.stringify({
        userAgent: c.req.header('user-agent') || null,
        referer: c.req.header('referer') || null,
        host: c.req.header('host') || null,
        correlationId,
      })
    })
  )
})

// API Key Auth Middleware
const requireApiKey: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    await next()
    return
  }

  const expectedApiKey = c.env.WORKER_API_KEY

  if (!expectedApiKey) {
    console.error('WORKER_API_KEY is not configured')
    return c.json({ error: 'Service misconfigured' }, 500)
  }

  // 1. Check Header (x-api-key)
  let providedApiKey = c.req.header('x-api-key')

  // 2. Check Header (Authorization: Bearer)
  if (!providedApiKey) {
    const authHeader = c.req.header('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      providedApiKey = authHeader.slice('Bearer '.length)
    }
  }

  // 3. Check Cookie (colby_api_key)
  if (!providedApiKey) {
    const cookieHeader = c.req.header('Cookie')
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split('=')
        acc[name] = value
        return acc
      }, {} as Record<string, string>)
      providedApiKey = cookies['colby_api_key']
    }
  }

  // 4. Check Query Param (key) - useful for quick debugging or specific WS cases if cookies fail
  if (!providedApiKey) {
    providedApiKey = c.req.query('key');
  }

  if (providedApiKey !== expectedApiKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
}

// Apply auth middleware to all API routes
app.use('/api/*', requireApiKey)
app.use('/mcp/*', requireApiKey)
app.use('/a2a/*', requireApiKey)


// --- 2. Route Definitions (on main 'app') ---

// Health check endpoint (NOT documented in OpenAPI)
app.get('/healthz', healthHandler)

// Webhook endpoint (NOT documented in OpenAPI)
app.post('/webhooks', webhookHandler)


// --- 3. API Spec Generation Apps ---

// App 1: Full Spec (for /openapi.json)
const fullSpecApp = new OpenAPIHono<{ Bindings: Bindings }>()
fullSpecApp.route('/octokit', octokitApi)
fullSpecApp.route('/tools', toolsApi)
fullSpecApp.route('/agents', agentsApi)
fullSpecApp.route('/retrofit', retrofitApi)
fullSpecApp.route('/flows', flowsApi)
fullSpecApp.route('/landing-generator', landingGeneratorApi)

// App 2: GPT-Specific Spec (for /gpt/openapi.json)
const gptSpecApp = new OpenAPIHono<{ Bindings: Bindings }>()
gptSpecApp.route('/octokit', octokitApi) // 3 methods
gptSpecApp.route('/agents', agentsApi)   // 2 methods
gptSpecApp.route('/flows', flowsApi)     // 2 methods
// Total = 7 methods


/**
 * Helper function to generate the enhanced 3.1.0 OpenAPI spec.
 */
const getEnhancedApiSpec = async (
  c: any,
  honoApp: OpenAPIHono<any>, // Pass in the app to generate the spec from
  title: string,
  description: string
) => {
  const baseUrl = new URL(c.req.url).origin

  const openApiJson = await honoApp.getOpenAPIDocument({
    openapi: '3.0.0', // Base doc is 3.0.0, will be enhanced
    info: { version: '1.0.0', title, description },
    // This 'servers' block is a placeholder. 
    // buildCompleteOpenAPIDocument will overwrite it with the correct, single, absolute URL.
    servers: [{ url: '/api' }],
  })

  // This function adds 3.1.0, single security scheme, and a single absolute server URL
  return buildCompleteOpenAPIDocument(openApiJson, baseUrl)
}

// --- OpenAPI Endpoints (on main 'app') ---

// /openapi.json [Full API Schema, 3.1.0, JSON]
app.get('/openapi.json', async (c) => {
  try {
    const enhanced = await getEnhancedApiSpec(c, fullSpecApp, // Use fullSpecApp
      'GitHub API Worker (Full Spec)',
      'Full API Spec (3.1.0) with all 11 operations.'
    )
    return c.json(enhanced, 200, {
      'X-API-Version': '3.1.0',
    })
  } catch (error: any) {
    console.error('Error generating OpenAPI 3.1 JSON:', error)
    return c.json({ error: 'Failed to generate OpenAPI 3.1 JSON', details: error.message }, 500)
  }
})

// /openapi.yaml [Full API Schema, 3.1.0, YAML]
app.get('/openapi.yaml', async (c) => {
  try {
    const enhanced = await getEnhancedApiSpec(c, fullSpecApp, // Use fullSpecApp
      'GitHub API Worker (Full Spec)',
      'Full API Spec (3.1.0) with all 11 operations.'
    )
    const yaml = convertOpenAPIToYAML(enhanced)
    return new Response(yaml, {
      headers: {
        'Content-Type': 'application/yaml',
        'X-API-Version': '3.1.0',
      },
    })
  } catch (error: any) {
    console.error('Error generating OpenAPI YAML:', error)
    return c.json({ error: 'Failed to generate OpenAPI YAML', details: error.message }, 500)
  }
})

// /gpt/openapi.json [Limited Schema for GPTs, 3.1.0, JSON]
app.get('/gpt/openapi.json', async (c) => {
  try {
    const enhanced = await getEnhancedApiSpec(c, gptSpecApp, // <-- Use gptSpecApp
      'GitHub Worker - GPT Custom Action',
      'A focused set of 7 high-level tools for OpenAI GPTs.'
    )
    return c.json(enhanced, 200, {
      'X-API-Version': '3.1.0',
    })
  } catch (error: any) {
    console.error('Error generating OpenAPI GPT JSON:', error)
    return c.json({ error: 'Failed to generate OpenAPI GPT JSON', details: error.message }, 500)
  }
})

// /gpt/openapi.yaml [Limited Schema for GPTs, 3.1.0, YAML]
app.get('/gpt/openapi.yaml', async (c) => {
  try {
    const enhanced = await getEnhancedApiSpec(c, gptSpecApp, // <-- Use gptSpecApp
      'GitHub Worker - GPT Custom Action',
      'A focused set of 7 high-level tools for OpenAI GPTs.'
    )
    const yaml = convertOpenAPIToYAML(enhanced)
    return new Response(yaml, {
      headers: {
        'Content-Type': 'application/yaml',
        'X-API-Version': '3.1.0',
      },
    })
  } catch (error: any) {
    console.error('Error generating OpenAPI GPT YAML:', error)
    return c.json({ error: 'Failed to generate OpenAPI GPT YAML', details: error.message }, 500)
  }
})


// --- 4. Other Runtime Routes (on main 'app') ---

// MCP Tools listing endpoint
app.get('/mcp-tools', async (c) => {
  const stats = getToolStats()
  return c.json({
    success: true,
    tools: serializeTools(), // Serialize Zod schemas to JSON Schema
    stats,
    metadata: {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      protocol: 'MCP',
    },
  })
})

// MCP Execute endpoint
app.post('/mcp-execute', async (c) => {
  const startTime = Date.now()

  try {
    const body = await c.req.json()

    // Validate JSON structure
    const parsed = MCPExecuteRequest.parse(body)

    // Get the tool
    const tool = getTool(parsed.tool)
    if (!tool) {
      return c.json({
        success: false,
        error: `Unknown tool: ${parsed.tool}`,
        availableTools: MCP_TOOLS.map(t => t.name),
      }, 404)
    }

    // Validate params against the tool's Zod schema
    const paramsValidation = tool.inputSchema.safeParse(parsed.params)
    if (!paramsValidation.success) {
      return c.json({
        success: false,
        error: 'Invalid parameters for tool',
        tool: parsed.tool,
        details: paramsValidation.error.errors,
      }, 400)
    }

    // Use validated params
    const validatedParams = paramsValidation.data

    // Get the route configuration for this tool
    const route = TOOL_ROUTES[parsed.tool];
    if (!route) {
      return c.json({
        success: false,
        error: `Tool "${parsed.tool}" not implemented`,
        availableTools: MCP_TOOLS.map(t => t.name),
      }, 501);
    }

    // Create an internal request to the appropriate endpoint
    const baseUrl = new URL(c.req.url).origin;
    const apiKey = c.req.header('x-api-key') || c.req.header('authorization')?.replace('Bearer ', '');

    // Build the path (use custom path builder if available)
    const path = route.pathBuilder ? route.pathBuilder(validatedParams) : route.path;
    const url = `${baseUrl}${path}`;

    // Build request headers
    const headers: Record<string, string> = {
      'x-api-key': apiKey || '',
    };
    if (route.method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    // Create and execute the request
    const internalReq = new Request(url, {
      method: route.method,
      headers,
      body: route.method === 'POST' ? JSON.stringify(validatedParams) : undefined,
    });

    // We must use the main 'app' to fetch, as it has the runtime routes
    const response = await app.fetch(internalReq, c.env, c.executionCtx);
    if (!response.ok) {
      return response; // Forward the error response
    }
    const result = await response.json();

    const durationMs = Date.now() - startTime

    return c.json({
      success: true,
      tool: parsed.tool,
      result,
      executedAt: new Date().toISOString(),
      durationMs,
    })
  } catch (error: any) {
    const durationMs = Date.now() - startTime
    console.error('MCP execution error:', error)
    return c.json({
      success: false,
      error: error?.message || 'Execution failed',
      details: error?.issues || error?.stack,
      durationMs,
    }, 400)
  }
})

// WebSocket upgrade endpoint
app.get('/ws', async (c) => {
  const upgrade = c.req.header('Upgrade')
  if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426)
  }

  // Get project ID from query params
  const url = new URL(c.req.url)
  const projectId = url.searchParams.get('projectId') || 'default'

  // Get or create the WebSocket room DO (using OrchestratorAgent)
  // We use the projectId as the ID for the Orchestrator
  const orchestratorId = c.env.ORCHESTRATOR.idFromName(projectId)
  const orchestratorStub = c.env.ORCHESTRATOR.get(orchestratorId)

  // Forward the request to the DO
  return orchestratorStub.fetch(c.req.raw)
})

import todosApi from './routes/api/todos'
import projectsApi from './routes/api/projects'

// Optional: Add swagger UI (points to the new 3.1.0 JSON spec)
app.get('/doc', swaggerUI({ url: '/openapi.json' }))

// --- 5. API Runtime Routes (on main 'app') ---

// Create ONE shared router instance for all business logic
const sharedApi = new OpenAPIHono<{ Bindings: Bindings }>()
sharedApi.route('/octokit', octokitApi)
sharedApi.route('/tools', toolsApi)
sharedApi.route('/agents', agentsApi)
sharedApi.route('/retrofit', retrofitApi)
sharedApi.route('/flows', flowsApi)
sharedApi.route('/ops', opsApi)
sharedApi.route('/tasks', tasksApi)
sharedApi.route('/todos', todosApi)
sharedApi.route('/projects', projectsApi)
sharedApi.route('/stats', statsApi)
sharedApi.route('/timeline', timelineApi)
sharedApi.route('/landing-generator', landingGeneratorApi)

// Mount browser-render BEFORE sharedApi to avoid shadowing if sharedApi captures /api base
app.route('/api/browser-render', browserRender)

// Mount the shared router under all three top-level paths
// This is what handles the *actual requests*
app.route('/api', sharedApi)
app.route('/mcp', sharedApi)
app.route('/a2a', sharedApi)
app.route('/api/webhooks', webhooksApi)


// --- 6. Helper Functions for Queue ---

async function handleQueue(batch: MessageBatch<any>, env: Env): Promise<void> {
  // Check if this queue is for workflows
  if (batch.queue === 'workflows') {
    // Process workflow events
    // TODO: Add workflow processing logic here
  }
}

// --- 7. Export Handlers ---

import healthApi from './routes/api/health'
import { HealthCoordinator } from './health/coordinator'

// Helper to re-export Durable Objects
export { OrchestratorAgent } from './agents/orchestrator'
export { RetrofitAgent } from './retrofit/RetrofitAgent'
export { RoomDO } from './do/RoomDO'
export { GeminiAgent } from './agents/gemini'
export { PlannerAgent } from './agents/planner'
export { Supervisor } from './objects/Supervisor'
export { DeepReasoningAgent } from './agents/deep-reasoning'
export { DataProcessor } from './do/DataProcessor'
export { GithubSearchWorkflow } from './workflows/search'



import chatApi from './routes/api/chat'

// Mount health API
sharedApi.route('/health', healthApi)
sharedApi.route('/chat', chatApi)

// Scheduled Event Handler
async function handleScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
  console.log('[Scheduler] Running scheduled tasks...');
  const healthService = new HealthCoordinator(env);
  ctx.waitUntil(healthService.runAllChecks('scheduled'));
}

export default {
  /**
   * HTTP fetch handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // List of all your API/dynamic prefixes.
    // Any request *not* matching these will be treated as a static asset request.
    const apiPrefixes = [
      '/api/',
      '/mcp/',
      '/a2a/',
      '/openapi.json',
      '/openapi.yaml',
      '/gpt/',
      '/mcp-tools',
      '/mcp-execute',
      '/ws',
      '/doc',
      '/healthz',
      '/webhooks'
    ];

    const isApiRequest = apiPrefixes.some(prefix => url.pathname.startsWith(prefix));

    if (isApiRequest) {
      return app.fetch(request, env, ctx);
    }

    // Try to serve static assets
    try {
      // If we are in local dev, this might fail if assets aren't configured.
      // In production, 'ASSETS' binding is auto-injected for Pages/Workers Sites.
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      } else {
        // Fallback or 404
        return new Response('Not Found', { status: 404 });
      }
    } catch (e) {
      return new Response('Error serving asset', { status: 500 });
    }
  },

  /**
   * Queue handler
   */
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },

  /**
   * Scheduled handler
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleScheduled(event, env, ctx);
  }
} satisfies ExportedHandler<Env>;

