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

  try {
    const db = getDb(c.env.DB)
    await db.insert(schema.requestLogs).values({
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
  } catch (error) {
    console.error('Failed to persist request log to D1', error)
  }
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

  const providedApiKey = c.req.header('x-api-key')
    || (c.req.header('authorization')?.startsWith('Bearer ')
      ? c.req.header('authorization')?.slice('Bearer '.length)
      : undefined)

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
app.post('/webhook', webhookHandler)


// --- 3. API Spec Generation Apps ---

// App 1: Full Spec (for /openapi.json)
const fullSpecApp = new OpenAPIHono<{ Bindings: Bindings }>()
fullSpecApp.route('/octokit', octokitApi)
fullSpecApp.route('/tools', toolsApi)
fullSpecApp.route('/agents', agentsApi)
fullSpecApp.route('/retrofit', retrofitApi)
fullSpecApp.route('/flows', flowsApi)

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
  if (upgrade !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426)
  }

  // Get project ID from query params
  const url = new URL(c.req.url)
  const projectId = url.searchParams.get('projectId') || 'default'

  // Get or create the WebSocket room DO
  const roomId = c.env.ROOM_DO.idFromName(projectId)
  const roomStub = c.env.ROOM_DO.get(roomId)

  // Forward the request to the DO
  return roomStub.fetch(c.req.raw)
})

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

// Mount the shared router under all three top-level paths
// This is what handles the *actual requests*
app.route('/api', sharedApi)
app.route('/mcp', sharedApi)
app.route('/a2a', sharedApi)


// --- 6. Helper Functions for Queue ---


// --- 7. Export Handlers ---

/**
 * Main export object for the Worker.
 * This object's properties (fetch, queue) are the entrypoints.
 */
export default {
  /**
   * HTTP fetch handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

    // --- THIS IS THE CORRECT FETCH HANDLER ---
    // It correctly routes API calls to Hono and all other calls to ASSETS.

    const url = new URL(request.url);

    // List of all your API/dynamic prefixes.
    // Any request *not* matching these will be treated as a static asset request.
    const apiPrefixes = [
      '/api/',
      '/mcp/',
      '/a2a/',
      '/openapi.json',
      '/openapi.yaml',
      '/gpt/openapi.json',
      '/gpt/openapi.yaml',
      '/doc', // The Swagger UI
      '/healthz',
      '/webhook',
      '/mcp-tools',
      '/ws' // WebSocket endpoint
    ];

    const isApiRoute = apiPrefixes.some(prefix => url.pathname.startsWith(prefix));

    if (isApiRoute) {
      // It's an API route. Let the Hono app handle it.
      return app.fetch(request, env, ctx);
    } else {
      // It's not an API route.
      // Assume it's a static asset and let env.ASSETS handle it.
      // env.ASSETS will automatically serve /index.html for /
      // and a 404 for any other file it can't find.
      return env.ASSETS.fetch(request);
    }
  },



  /**
   * GitHubWorker - RPC service class
   *
   * This class is a NAMED export. Other workers must use this name as the 'entrypoint'
   * in their service binding configuration to call these RPC methods.
   */
  export class GitHubWorker {
  private rpc: GitHubWorkerRPC | null = null
  private env: Env | null = null

  private getRPC(env: Env): GitHubWorkerRPC {
    if (!this.rpc || this.env !== env) {
      this.env = env
      this.rpc = new GitHubWorkerRPC(env)
    }
    return this.rpc
  }

  /**
   * Check the health status of the worker
   */
  async health(env: Env) {
    return this.getRPC(env).health()
  }

  /**
   * Create or update a file in a GitHub repository
   */
  async upsertFile(request: Parameters < GitHubWorkerRPC['upsertFile'] > [0], env: Env) {
    return this.getRPC(env).upsertFile(request)
  }

  /**
   * List repository contents with a tree-style representation
   */
  async listRepoTree(request: Parameters < GitHubWorkerRPC['listRepoTree'] > [0], env: Env) {
    return this.getRPC(env).listRepoTree(request)
  }

  /**
   * Open a new pull request
   */
  async openPullRequest(request: Parameters < GitHubWorkerRPC['openPullRequest'] > [0], env: Env) {
    return this.getRPC(env).openPullRequest(request)
  }

  /**
   * Create a new issue
   */
  async createIssue(request: Parameters < GitHubWorkerRPC['createIssue'] > [0], env: Env) {
    return this.getRPC(env).createIssue(request)
  }

  /**
   * Generic proxy for GitHub REST API calls
   */
  async octokitRest(request: Parameters < GitHubWorkerRPC['octokitRest'] > [0], env: Env) {
    return this.getRPC(env).octokitRest(request)
  }

  /**
   * Execute a GraphQL query against the GitHub API
   */
  async octokitGraphQL(request: Parameters < GitHubWorkerRPC['octokitGraphQL'] > [0], env: Env) {
    return this.getRPC(env).octokitGraphQL(request)
  }

  /**
   * Create a new agent session for GitHub search and analysis
   */
  async createSession(request: Parameters < GitHubWorkerRPC['createSession'] > [0], env: Env) {
    return this.getRPC(env).createSession(request)
  }

  /**
   * Get the status of an agent session
   */
  async getSessionStatus(request: Parameters < GitHubWorkerRPC['getSessionStatus'] > [0], env: Env) {
    return this.getRPC(env).getSessionStatus(request)
  }

  /**
   * Search for GitHub repositories
   */
  async searchRepositories(request: Parameters < GitHubWorkerRPC['searchRepositories'] > [0], env: Env) {
    return this.getRPC(env).searchRepositories(request)
  }

  /**
   * Batch upsert multiple files in a single call
   */
  async batchUpsertFiles(requests: Parameters < GitHubWorkerRPC['batchUpsertFiles'] > [0], env: Env) {
    return this.getRPC(env).batchUpsertFiles(requests)
  }

  /**
   * Batch create multiple issues in a single call
   */
  async batchCreateIssues(requests: Parameters < GitHubWorkerRPC['batchCreateIssues'] > [0], env: Env) {
    return this.getRPC(env).batchCreateIssues(requests)
  }
}

// Export Durable Objects
export { RetrofitAgent } from './retrofit/RetrofitAgent'
export { OrchestratorAgent } from './agents/orchestrator'
export { RoomDO } from './do/RoomDO'
export { GeminiAgent } from './agents/gemini'

// Export Workflows
export { GithubSearchWorkflow } from './workflows/search'

/**
 * @extension_point
 * This is a good place to add new top-level routes or middleware.
 * For example, you could add an authentication middleware here.
 */
