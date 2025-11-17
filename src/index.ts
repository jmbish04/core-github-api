/**
 * @file src/index.ts
 * @description This is the main entry point for the Cloudflare Worker.
 * @owner AI-Builder
*/

import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { app, Bindings } from './utils/hono' // Main 'app' for RUNTIME
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

app.use('/api/*', requireApiKey)
app.use('/mcp/*', requireApiKey)
app.use('/a2a/*', requireApiKey)


// --- 2. Route Definitions (on main 'app') ---

// Health check endpoint (NOT documented in OpenAPI)
app.get('/healthz', healthHandler)

// Webhook endpoint (NOT documented in OpenAPI)
app.post('/webhook', webhookHandler)


// --- 3. API Spec Generation (using a separate, clean app) ---

// Create a new Hono app *just for generating the spec*.
// This app will *only* contain routes we want in the documentation.
const apiSpecApp = new OpenAPIHono<{ Bindings: Bindings }>()

// Register all your API routers with the spec-only app
apiSpecApp.route('/octokit', octokitApi)
apiSpecApp.route('/tools', toolsApi)
apiSpecApp.route('/agents', agentsApi)
apiSpecApp.route('/retrofit', retrofitApi)
apiSpecApp.route('/flows', flowsApi)

/**
 * Helper function to generate the enhanced 3.1.0 OpenAPI spec.
 * It uses the 'apiSpecApp' to create a clean doc.
 */
const getEnhancedApiSpec = async (c: any) => {
  const baseUrl = new URL(c.req.url).origin
  
  // Generate the spec from 'apiSpecApp', NOT the main 'app'
  const openApiJson = await apiSpecApp.getOpenAPIDocument({
    openapi: '3.0.0', // Base doc is 3.0.0, will be enhanced
    info: { 
      version: '1.0.0', 
      title: 'GitHub API Worker',
      description: 'A GPT-compatible spec for the GitHub API Worker (11 operations).'
    },
    // This 'servers' block is a placeholder. 
    // buildCompleteOpenAPIDocument will overwrite it with the correct, single, absolute URL.
    servers: [{ url: '/api' }], 
  })
  
  // This function adds 3.1.0, single security scheme, and a single absolute server URL
  return buildCompleteOpenAPIDocument(openApiJson, baseUrl)
}

// /openapi.json [Full, GPT-Compatible, 3.1.0, JSON]
// This route is on the main 'app' but generates a spec from 'apiSpecApp'
app.get('/openapi.json', async (c) => {
  try {
    const enhanced = await getEnhancedApiSpec(c)
    return c.json(enhanced, 200, {
      'X-API-Version': '3.1.0',
    })
  } catch (error: any) {
    console.error('Error generating OpenAPI 3.1 JSON:', error)
    return c.json({ error: 'Failed to generate OpenAPI 3.1 JSON', details: error.message }, 500)
  }
})

// /openapi.yaml [Full, GPT-Compatible, 3.1.0, YAML]
// This route is on the main 'app' but generates a spec from 'apiSpecApp'
app.get('/openapi.yaml', async (c) => {
  try {
    const enhanced = await getEnhancedApiSpec(c)
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
    // Validate request size (DoS prevention)
    const contentLength = c.req.header('content-length')
    const MAX_REQUEST_SIZE = 1024 * 1024 // 1MB
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      return c.json({
        success: false,
        error: 'Request too large',
        maxSize: MAX_REQUEST_SIZE,
      }, 413)
    }

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

type WorkersAiBinding = {
  run(model: string, request: Record<string, unknown>): Promise<unknown>
}

async function searchRepositoriesWithRetry(
  searchTerm: string,
  env: Env,
  ctx: ExecutionContext,
  retries = 3
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      // We must use a full Request object to pass through the auth headers
      const request = new Request(`http://localhost/api/octokit/search/repos?q=${encodeURIComponent(searchTerm)}`, {
        headers: {
          'x-api-key': env.WORKER_API_KEY,
          'User-Agent': 'Cloudflare-Worker'
        },
      })
      // We call app.fetch to route the request internally
      const response = await app.fetch(request, env, ctx)
      if (response.status === 200) {
        return await response.json()
      }
    } catch (error) {
      if (i === retries - 1) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}

// --- MODIFICATION: Updated analyzeRepository function ---
async function analyzeRepository(
  repo: any,
  searchTerm: string,
  ai: WorkersAiBinding
): Promise<{ relevancyScore: number }> {
  
  // 1. Define the schema Llama 3.3 must return
  const analysisSchema = {
    type: "object",
    properties: {
      relevancyScore: { 
        type: "number", 
        minimum: 0, 
        maximum: 1,
        description: "A score from 0.0 to 1.0, where 1.0 is highly relevant."
      },
      reasoning: { 
        type: "string",
        description: "A brief justification for the score, explaining why the repo is or is not relevant."
      }
    },
    required: ["relevancyScore", "reasoning"]
  };

  // 2. Step 1: Reasoning with @cf/openai/gpt-oss-120b
  const reasoningInstructions = `
    You are a GitHub repository analyst. Your task is to rate the relevancy of a repository 
    to a search term on a scale of 0.0 to 1.0.
    Search Term: "${searchTerm}"
    Repository: ${repo.full_name}
    Description: "${repo.description || 'No description provided.'}"
    
    Provide a relevancy score (e.g., 0.8) and a *brief* justification for your score.
    Return only the score and justification.
  `;
  
  const gptResponse = await ai.run('@cf/openai/gpt-oss-120b', {
    instructions: reasoningInstructions,
    input: `Rate relevancy for: ${repo.full_name}`,
  });
  
  const rawAnalysisText = typeof gptResponse === 'string' ? gptResponse : (gptResponse as any).response || '';

  // 3. Step 2: Structuring with @cf/meta/llama-3.3-70b-instruct-fp8-fast
  try {
    const structuringSystemPrompt = `
      You are a text standardization assistant. Parse the raw analysis text and return a 
      structured JSON object that *strictly* adheres to the provided JSON schema. 
      Return *only* the valid JSON object.
    `;
    
    const llamaMessages = [
      { role: "system", content: structuringSystemPrompt },
      { role: "user", content: `Here is the raw text to parse:\n\n${rawAnalysisText}` }
    ];

    const llamaResponse = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: llamaMessages,
      response_format: { 
        type: "json_schema",
        json_schema: analysisSchema
      }
    });

    // 4. Parse the structured response
    const structuredResponse = JSON.parse((llamaResponse as any).response);
    
    if (structuredResponse && typeof structuredResponse.relevancyScore === 'number') {
      // Success!
      return { relevancyScore: structuredResponse.relevancyScore };
    }
    
    console.warn(`AI response for ${repo.full_name} did not match schema:`, (llamaResponse as any).response);
    return { relevancyScore: 0 };

  } catch (e) {
    console.error(`Failed to parse AI JSON response for ${repo.full_name}:`, e, (rawAnalysisText));
    
    // Fallback: try to find a number in the *original* raw text from GPT-OSS
    const scoreMatch = rawAnalysisText.match(/(\d\.\d+)/);
    if (scoreMatch && scoreMatch[1]) {
      const score = Number.parseFloat(scoreMatch[1]);
      if (Number.isFinite(score)) {
        return { relevancyScore: score };
      }
    }
    
    return { relevancyScore: 0 }; // Final fallback
  }
}
// --- END MODIFICATION ---

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
    
    // --- MODIFICATION: Add ASSETS handling ---
    try {
      // 1. First, try to fetch the request as a static asset.
      // This will serve public/landing.html at /landing.html
      // Or public/index.html at /
      return await env.ASSETS.fetch(request);
    } catch (e) {
      // 2. If it's not a static asset (e.g., 404), fall back to the Hono API app.
      // The Hono app handles /api, /mcp, /a2a, /openapi.json, etc.
      return app.fetch(request, env, ctx);
    }
    // --- END MODIFICATION ---
  },

  /**
   * Queue message handler
   */
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    const aiBinding = env.AI as WorkersAiBinding | undefined

    if (!aiBinding || typeof aiBinding.run !== 'function') {
      throw new Error('AI binding is not configured on the environment')
    }

    const db = getDb(env.DB)

    for (const message of batch.messages) {
      const { sessionId, searchId, searchTerm } = message.body

      // 1. Execute the search
      // Use 'app' to ensure the request is routed correctly with auth
      const searchResults = await searchRepositoriesWithRetry(searchTerm, env, ctx)

      // 2. Analyze each repository
      for (const repo of searchResults.items) {
        // 2a. Check if the repository has already been analyzed for this session
        const results = await db.select({ id: schema.repoAnalysis.id })
          .from(schema.repoAnalysis)
          .where(
            and(
              eq(schema.repoAnalysis.sessionId, sessionId),
              eq(schema.repoAnalysis.repoFullName, repo.full_name)
            )
          )
          .all()

        if (results.length > 0) {
          continue
        }

        // 2b. Analyze the repository
        const analysis = await analyzeRepository(repo, searchTerm, aiBinding)

        // 2c. Persist the analysis to D1
        await db.insert(schema.repoAnalysis).values({
          sessionId,
          searchId,
          repoFullName: repo.full_name,
          repoUrl: repo.html_url,
          description: repo.description,
          relevancyScore: analysis.relevancyScore
        })
      }

      // 3. Update the search status
      await db.update(schema.searches)
        .set({ status: 'completed' })
        .where(eq(schema.searches.id, searchId))

      // 4. Notify the orchestrator that the workflow is complete
      const orchestrator = env.ORCHESTRATOR.get(
        env.ORCHESTRATOR.idFromName('orchestrator')
      )
      await orchestrator.workflowComplete(searchId)

      message.ack()
    }
  }
}


/**
 * GitHubWorker - RPC service class
 *
 * This class is a NAMED export. Other workers must use this name as the 'entrypoint'
 * in their service binding configuration to call these RPC methods.
 *
 * Example consumer wrangler.jsonc:
 * {
 * "services": [
 * {
 * "binding": "GITHUB_WORKER",
 * "service": "core-github-api",
 * "entrypoint": "GitHubWorker" // <-- This is the new required key
 * }
 * ]
 * }
 */
export class GitHubWorker {
  private rpc: GitHubWorkerRPC | null = null
  private env: Env | null = null

  // NOTE: 'fetch' and 'queue' handlers are removed from this class
  // and are now on the 'export default' object.

  // ==================== RPC Methods ====================
  // These methods can be called directly when this worker is used as a service binding

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
  async upsertFile(request: Parameters<GitHubWorkerRPC['upsertFile']>[0], env: Env) {
    return this.getRPC(env).upsertFile(request)
  }

  /**
   * List repository contents with a tree-style representation
   */
  async listRepoTree(request: Parameters<GitHubWorkerRPC['listRepoTree']>[0], env: Env) {
    return this.getRPC(env).listRepoTree(request)
  }

  /**
   * Open a new pull request
   */
  async openPullRequest(request: Parameters<GitHubWorkerRPC['openPullRequest']>[0], env: Env) {
    return this.getRPC(env).openPullRequest(request)
  }

  /**
   * Create a new issue
   */
  async createIssue(request: Parameters<GitHubWorkerRPC['createIssue']>[0], env: Env) {
    return this.getRPC(env).createIssue(request)
  }

  /**
   * Generic proxy for GitHub REST API calls
   */
  async octokitRest(request: Parameters<GitHubWorkerRPC['octokitRest']>[0], env: Env) {
    return this.getRPC(env).octokitRest(request)
  }

  /**
   * Execute a GraphQL query against the GitHub API
   */
  async octokitGraphQL(request: Parameters<GitHubWorkerRPC['octokitGraphQL']>[0], env: Env) {
    return this.getRPC(env).octokitGraphQL(request)
  }

  /**
   * Create a new agent session for GitHub search and analysis
   */
  async createSession(request: Parameters<GitHubWorkerRPC['createSession']>[0], env: Env) {
    return this.getRPC(env).createSession(request)
  }

  /**
   * Get the status of an agent session
   */
  async getSessionStatus(request: Parameters<GitHubWorkerRPC['getSessionStatus']>[0], env: Env) {
    return this.getRPC(env).getSessionStatus(request)
  }

  /**
   * Search for GitHub repositories
   */
  async searchRepositories(request: Parameters<GitHubWorkerRPC['searchRepositories']>[0], env: Env) {
    return this.getRPC(env).searchRepositories(request)
  }

  /**
   * Batch upsert multiple files in a single call
   */
  async batchUpsertFiles(requests: Parameters<GitHubWorkerRPC['batchUpsertFiles']>[0], env: Env) {
    return this.getRPC(env).batchUpsertFiles(requests)
  }

  /**
   * Batch create multiple issues in a single call
   */
  async batchCreateIssues(requests: Parameters<GitHubWorkerRPC['batchCreateIssues']>[0], env: Env) {
    return this.getRPC(env).batchCreateIssues(requests)
  }
}

// Export Durable Objects
export { RetrofitAgent } from './retrofit/RetrofitAgent'
export { OrchestratorAgent } from './agents/orchestrator'
export { RoomDO } from './do/RoomDO'

// Export Workflows
export { GithubSearchWorkflow } from './workflows/search'

/**
 * @extension_point
 * This is a good place to add new top-level routes or middleware.
 * For example, you could add an authentication middleware here.
 */
