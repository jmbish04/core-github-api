/**
 * @file src/index.ts
 * @description This is the main entry point for the Cloudflare Worker.
 * @owner AI-Builder
*/

import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { getAgentByName } from 'agents'
// 'app' is the Hono app that handles all our API routes
import { app, Bindings } from "@utils/hono";
import { logSecretStatus } from "@utils/debug-secrets";
import { GitHubWorkerRPC } from "@/routes/rpc";
import { convertOpenAPIToYAML, buildCompleteOpenAPIDocument } from "@utils/openapi";
import { MCP_TOOLS, getToolStats, getTool, MCPExecuteRequest, TOOL_ROUTES, serializeTools } from "@/ai/mcp/tools";
import { getDb, schema } from "@db";
import { eq, and, desc } from 'drizzle-orm'

// Import routes
import octokitApi from "@/services/octokit";
import toolsApi from "@/ai/mcp/tools/github/index";
import agentsApi from "@/routes/api/agents";
import retrofitApi from "@/retrofit";
import flowsApi from "@/flows";
import { webhookHandler } from "@/routes/webhooks";
import { starsHandler } from "@/routes/stars";
import { healthHandler } from "@/routes/health";
import opsApi from "@/routes/api/ops";
import tasksApi from "@/routes/api/tasks";
import statsApi from "@/routes/api/stats";
import timelineApi from "@/routes/api/timeline";
import landingGeneratorApi from "@/routes/api/landing-generator";
import webhooksApi from "@/routes/api/webhooks";
import healthApi from "@/routes/api/health";
import chatApi from "@/routes/api/chat";
import workflowsApi from "@/routes/api/workflows";
import settingsApi from "@/routes/api/settings";
import research from "./routes/api/research";
import browserRender from "@services/browser_render";
import authApi from "@/routes/auth";
import julesApi from "@/routes/api/jules";
import dailyTrendsApi from "@/routes/daily-trends";
import ghActionsApi from "@/routes/api/gh-actions";
import standardsApi from "@/routes/api/standards";
import invokeApi from "@/routes/api/jules/invoke";
import trendingReposApi from "@/routes/api/trending-repos";
import { sendEmail } from "@utils/email";



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
  const requestLogId = Date.now() * 1000 + Math.floor(Math.random() * 1000)

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
    (async () => {
      try {
        await db.insert(schema.requestLogs).values({
          id: requestLogId,
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
        console.error('[request_logs] Failed to persist request log:', error)
      }
    })()
  )
})

// API Key Auth Middleware
const requireApiKey: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    await next()
    return
  }

  // Diagnostic: Check all secrets from Secrets Store
  try {
    const workerApiKey = await c.env.WORKER_API_KEY.get()
    const githubToken = await c.env.GITHUB_TOKEN.get()
    const aiGatewayToken = await c.env.AI_GATEWAY_TOKEN.get()
    
    console.log('[Secrets Diagnostic]', {
      WORKER_API_KEY: workerApiKey ? `${workerApiKey.substring(0, 8)}...${workerApiKey.substring(workerApiKey.length - 4)}` : 'NULL',
      GITHUB_TOKEN: githubToken ? `${githubToken.substring(0, 8)}...${githubToken.substring(githubToken.length - 4)}` : 'NULL',
      AI_GATEWAY_TOKEN: aiGatewayToken ? `${aiGatewayToken.substring(0, 8)}...${aiGatewayToken.substring(aiGatewayToken.length - 4)}` : 'NULL',
    })
  } catch (err) {
    console.error('[Secrets Diagnostic Error]', err)
  }

  const expectedApiKey = await c.env.WORKER_API_KEY.get()

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
app.use('/upsert/*', requireApiKey)


// --- 2. Route Definitions (on main 'app') ---

// Health check endpoint (NOT documented in OpenAPI)
app.get('/healthz', healthHandler)

// Webhook endpoint (NOT documented in OpenAPI)
app.post('/webhooks', webhookHandler)

// Stars Sync endpoint
app.post('/upsert/stars', starsHandler)

// Daily Research endpoint
import { dailyResearchHandler } from "@/routes/daily-research";
app.post('/upsert/daily-research', dailyResearchHandler)

// Config endpoint - exposes public configuration to the frontend
app.get('/api/config', (c) => {
  return c.json({
    owner: (c.env as any).GITHUB_OWNER || '',
    features: { automations: true, liveEvents: true },
  })
})

// Route for /api/webhooks
app.route('/api/webhooks', webhooksApi);
app.route('/api/health', healthApi);


// --- 3. API Spec Generation Apps ---

// App 1: Full Spec (for /openapi.json)
const fullSpecApp = new OpenAPIHono<{ Bindings: Env }>()
fullSpecApp.route('/octokit', octokitApi)
fullSpecApp.route('/tools', toolsApi)
fullSpecApp.route('/agents', agentsApi)
fullSpecApp.route('/retrofit', retrofitApi)
fullSpecApp.route('/flows', flowsApi)
fullSpecApp.route('/landing-generator', landingGeneratorApi)

// App 2: GPT-Specific Spec (for /gpt/openapi.json)
const gptSpecApp = new OpenAPIHono<{ Bindings: Env }>()
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
    openapi: '3.1.0',
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

// /llms.txt [Model-friendly service index]
app.get('/llms.txt', (c) => {
  const origin = new URL(c.req.url).origin
  const lines = [
    '# Core GitHub API',
    '',
    `Base: ${origin}`,
    '',
    'Docs:',
    `- OpenAPI JSON: ${origin}/openapi.json`,
    `- Swagger UI: ${origin}/swagger`,
    `- Scaler API Ref: ${origin}/scaler`,
    '',
    'Health:',
    `- Liveness: ${origin}/healthz`,
    '',
    'Notes:',
    '- API endpoints under /api/* require WORKER_API_KEY via x-api-key, Authorization Bearer, or cookie.',
    '- This file is intended for LLM/tool discovery.',
    ''
  ]

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  })
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
        details: paramsValidation.error.issues,
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
  const getByName = getAgentByName as any
  const orchestratorStub = await getByName(c.env.ORCHESTRATOR, projectId)

  // Forward the request to the DO
  return orchestratorStub.fetch(c.req.raw)
})

import todosApi from "@/routes/api/todos";
import projectsApi from "@/routes/api/projects";

// Optional: Add swagger UI (points to the new 3.1.0 JSON spec)
app.get('/doc', swaggerUI({ url: '/openapi.json' }))

// --- 5. API Runtime Routes (on main 'app') ---

// Create ONE shared router instance for all business logic
const sharedApi = new OpenAPIHono<{ Bindings: Env }>()
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
sharedApi.route('/health', healthApi)
sharedApi.route('/chat', chatApi)
sharedApi.route('/workflows', workflowsApi)
sharedApi.route('/settings', settingsApi)
sharedApi.route('/settings', settingsApi)
sharedApi.route('/research', research)
sharedApi.route('/jules', julesApi)
sharedApi.route('/daily-trends', dailyTrendsApi)
sharedApi.route('/', ghActionsApi)
sharedApi.route('/actions/daily-trends', trendingReposApi)
sharedApi.route('/standards', standardsApi)
sharedApi.route('/jules/invoke', invokeApi)


// Mount browser-render BEFORE sharedApi to avoid shadowing if sharedApi captures /api base
app.route('/api/browser-render', browserRender)

// Mount the shared router under all three top-level paths
// This is what handles the *actual requests*
app.route('/api', sharedApi)
app.route('/mcp', sharedApi)
app.route('/a2a', sharedApi)
app.route('/api/webhooks', webhooksApi)
app.route('/auth', authApi)


// --- 6. Helper Functions for Queue ---

async function handleQueue(batch: MessageBatch<any>, env: Env): Promise<void> {
  // Check if this queue is for workflows
  if (batch.queue === 'workflows') {
    // Process workflow events
    // TODO: Add workflow processing logic here
  }
}

// --- 7. Export Handlers ---
import { HealthCoordinator } from "@/health/coordinator";
import { getOctokit } from "@/services/octokit/core";


// Helper to re-export Durable Objects
export { OrchestratorAgent } from "@/ai/agents/Orchestrator";
export { RetrofitAgent } from "@/retrofit/RetrofitAgent";
export { RoomDO } from "@/do/RoomDO";
export { PlannerAgent } from "@/ai/agents/Planner";
export { RepoAgent } from "@/ai/agents/github/Repo";
export { OwnerAgent } from "@/ai/agents/github/Owner";
export { Supervisor } from "@/ai/agents/Supervisor";
export { DeepReasoningAgent } from "@/ai/agents/DeepReasoning";
// export { DataProcessor } from "@/do/DataProcessor";
export { GeminiAgent } from "@/ai/agents/Gemini";
export { GithubSearchWorkflow, DeepResearchWorkflow, TopicResearchWorkflow } from "@/workflows";

// Research Agents (Topic Research)
export { TopicOrchestratorAgent } from "./ai/agents/TopicOrchestrator";
export { WebSearchAgent } from "./ai/agents/WebSearch";
export { JudgeAgent } from "./ai/agents/Judge";
export { ReportingAgent } from "./ai/agents/Reporting";

// Existing Exports
export { ResearchAgent } from "@/ai/agents/Research";
export { JulesOverseer } from "@/ai/agents/JulesOverseer";


// Sandbox SDK — the Sandbox Durable Object class is provided by the SDK
export { Sandbox } from '@cloudflare/sandbox'
// Scheduled Event Handler
async function handleScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
  console.log('[Scheduled] Cron trigger fired:', event.cron);
  
  // Daily research scan at 9 AM UTC
  if (event.cron === '0 9 * * *') {
    console.log('[Scheduled] Starting daily research scan...');
    
    try {
      const db = getDb(env.DB);
      
      // 1. Create a "Daily Trends" Brief
      const [brief] = await db.insert(schema.researchBriefs).values({
          title: `Daily Trends - ${new Date().toISOString().split('T')[0]}`,
          rawBriefContent: JSON.stringify({ 
              topic: "Trending GitHub Repositories", 
              depth: "shallow",
              goals: ["Find high-growth repos", "Identify new AI tools"] 
          }),
          status: "researching",
          createdAt: new Date(),
          updatedAt: new Date()
      }).returning();

      // 2. Trigger Workflow with mode="trending"
      const workflow = await env.TOPIC_RESEARCH_WORKFLOW.create({
        params: {
          briefId: brief.id,
          plan: {
             topic: "Trending GitHub Repositories",
             goals: ["Find high-growth repos", "Identify new AI tools"],
             search_queries: [
                 "github trending repositories this week",
                 "best new open source AI tools 2026",
                 "growing typescript libraries 2026"
             ]
          },
          mode: "trending"
        },
      });
      
      console.log(`[Scheduled] Research workflow started: ${workflow.id}`);
      
      // Wait for completion (with timeout)
      ctx.waitUntil(
        (async () => {
          try {
            // Poll for completion (max 10 minutes)
            const maxAttempts = 60; // 60 * 10s = 10 minutes
            let attempts = 0;
            
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
              const status = await workflow.status();
              
              if (status.status === "complete") {
                console.log('[Scheduled] Research workflow completed');
                
                // Send email report
                // status.output contains { status: "complete", candidates: [...] }
                const output = status.output as any;
                const candidates = output.candidates || [];
                
                if (candidates.length > 0 && env.SEB) {
                   const htmlContent = `
                      <h2 style="color: #111827; margin-top: 0;">Daily Trends Report</h2>
                      <p style="color: #4b5563;">Found <strong>${candidates.length}</strong> trending items today.</p>
                      <ul style="padding-left: 20px;">
                          ${candidates.map((c: any) => `
                              <li style="margin-bottom: 15px;">
                                  <a href="${c.url}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${c.title || c.url}</a><br/>
                                  <span style="color: #6b7280; font-size: 14px;">${c.judgement.reasoning}</span>
                              </li>
                          `).join('')}
                      </ul>
                   `;
                   
                   await sendEmail(env, {
                      to: "colby@internal.system", // Configure real recipient
                      subject: `Daily Trends - ${brief.title}`,
                      contentHtml: htmlContent,
                      plainTextFallback: `Found ${candidates.length} trending items.`
                   });
                }
                break;
              } else if (status.status === "errored" || status.status === "terminated") {
                console.error('[Scheduled] Research workflow failed:', status.error);
                break;
              }
              
              attempts++;
            }
          } catch (error) {
            console.error('[Scheduled] Error processing research results:', error);
          }
        })()
      );
    } catch (error) {
      console.error('[Scheduled] Failed to start research workflow:', error);
    }
  }
  
  // Weekly pricing scraper at 2 AM UTC on Mondays
  if (event.cron === '0 2 * * 1') {
    console.log('[Scheduled] Starting weekly pricing scraper...');
    
    try {
      const { scrapePricing } = await import("@services/pricing-scraper");
      await scrapePricing(env, ctx);
      console.log('[Scheduled] Pricing scraper completed successfully');
    } catch (error: any) {
      console.error('[Scheduled] Pricing scraper failed:', error);
    }
  }

  // Jules Overseer Check (Every 3 hours)
  if (event.cron === '0 */3 * * *') {
     console.log('[Scheduled] Starting Jules Overseer check...');
     try {
        // We use a singleton ID for the overseer
        const id = env.JULES_OVERSEER.idFromName('singleton-overseer');
        const stub = env.JULES_OVERSEER.get(id);
        
        // Trigger the check via calling fetch (since it's a DO)
        // Or better, if it exposes a specific RPC method via the SDK, we can use that if we cast it.
        // For standard Agents/DOs, we usually just hit an endpoint or "run" it.
        // BaseAgent supports 'run' but for a cron we might want a specific method.
        // Since we can't easily call 'checkActiveSessions' directly via fetch without routing,
        // We will assume the agent handles a specific 'action' in its run method or expose a scheduled handler
        // But since this is `handleScheduled` in the worker, we need to invoke the DO.
        // The Agent SDK usually expects a "task" or "instruction".
        
        // Let's use the standard Agent "run" logic to instruct it to check sessions?
        // OR, let's just make `JulesOverseer` have a `fetch` handler that calls `checkActiveSessions`
        // if we hit a specific path. 
        
        // Simpler for now: The agent is a DO. We can send a request to it.
        await stub.fetch('http://internal/schedule/check');
        
        console.log('[Scheduled] Jules Overseer check initiated');
     } catch (error) {
        console.error('[Scheduled] Jules Overseer check failed:', error);
     }
  }

  
  // Weekly Health Suite (Sundays 3:00 AM UTC)
  if (event.cron === '0 3 * * 0') {
    console.log('[Scheduled] Starting weekly health suite...');
    const healthService = new HealthCoordinator(env);
    ctx.waitUntil(healthService.runAllChecks('scheduled'));
  }
  
  // Daily Discovery: Research trending repositories
  ctx.waitUntil((async () => {
    try {
      console.log('[Scheduler] Starting daily discovery...');
      
      // Fetch trending repositories from GitHub
      const octokit = await getOctokit(env);
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const trendingQuery = `created:>${weekAgo.toISOString().split('T')[0]} stars:>100`;
      const searchResult = await octokit.search.repos({
        q: trendingQuery,
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      });
      
      const trendingRepos = searchResult.data.items || [];
      console.log(`[Scheduler] Found ${trendingRepos.length} trending repos`);
      
      // Trigger research workflows for each repo
      const workflowPromises = trendingRepos.map(async (repo: any) => {
        try {
          const instance = await env.DEEP_RESEARCH_WORKFLOW.create({
            params: {
              repoUrl: repo.clone_url,
              repoOwner: repo.owner.login,
              repoName: repo.name,
              mode: 'discovery',
            },
          });
          
          console.log(`[Scheduler] Triggered workflow for ${repo.full_name}: ${instance.id}`);
          return { repo: repo.full_name, workflowId: instance.id, status: 'triggered' };
        } catch (error: any) {
          console.error(`[Scheduler] Failed to trigger workflow for ${repo.full_name}:`, error);
          return { repo: repo.full_name, error: error.message, status: 'failed' };
        }
      });
      
      const results = await Promise.all(workflowPromises);
      
      // Generate HTML email report
      const successfulWorkflows = results.filter(r => r.status === 'triggered');
      const failedWorkflows = results.filter(r => r.status === 'failed');
      
      const htmlContent = `
        <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Daily GitHub Research Digest</h2>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h3 style="margin-top: 0; color: #111827;">Summary</h3>
          <p style="margin: 5px 0;"><strong>Total Analyzed:</strong> ${trendingRepos.length}</p>
          <p style="margin: 5px 0; color: #059669;"><strong>Successful Workflows:</strong> ${successfulWorkflows.length}</p>
          <p style="margin: 5px 0; color: #dc2626;"><strong>Failed Workflows:</strong> ${failedWorkflows.length}</p>
        </div>
        
        <h3 style="color: #111827;">Trending Repositories</h3>
        <ul style="list-style: none; padding: 0;">
          ${results.map(r => `
            <li style="padding: 15px; margin: 10px 0; background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid ${r.status === 'failed' ? '#ef4444' : '#10b981'}; border-radius: 6px;">
              <strong style="color: #111827; font-size: 16px;">${r.repo}</strong><br>
              <span style="font-size: 14px; color: #4b5563; display: inline-block; margin-top: 5px;">
                ${r.status === 'triggered' ? `✅ Workflow ID: ${r.workflowId}` : `❌ Error: ${r.error}`}
              </span>
            </li>
          `).join('')}
        </ul>
      `;

      // Send email
      if (env.SEB) {
        try {
          await sendEmail(env, {
            to: 'team@example.com',
            subject: `Daily Research Digest - ${today.toLocaleDateString()}`,
            contentHtml: htmlContent,
            plainTextFallback: `Summary: ${successfulWorkflows.length} successful, ${failedWorkflows.length} failed.`
          });
        } catch (error: any) {
          console.error('[Scheduler] Failed to send email:', error);
        }
      }
      
    } catch (error: any) {
      console.error('[Scheduler] Daily discovery failed:', error);
    }
  })());
}


export default {
  /**
   * HTTP fetch handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Debug secrets on every request (non-blocking)
    ctx.waitUntil(logSecretStatus(env));
    
    const url = new URL(request.url);
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    const docsPath =
      url.pathname === '/swagger' || url.pathname === '/swagger/'
        ? '/swagger/index.html'
        : url.pathname === '/scaler' || url.pathname === '/scaler/'
          ? '/scaler/index.html'
          : null;

    // Keep exact and prefix routes separate so `/doc` does not accidentally
    // match frontend routes like `/docs`.
    const apiExactPaths = new Set([
      '/openapi.json',
      '/openapi.yaml',
      '/llms.txt',
      '/mcp-tools',
      '/mcp-execute',
      '/ws',
      '/doc',
      '/healthz',
      '/webhooks',
    ]);
    
    const apiPrefixPaths = ['/api/', '/mcp/', '/a2a/', '/gpt/', '/upsert/', '/auth/github/'];

    const isApiRequest =
      apiExactPaths.has(url.pathname) ||
      apiPrefixPaths.some((prefix) => url.pathname.startsWith(prefix));

    if (isApiRequest) {
      return app.fetch(request, env, ctx);
    }

    // Try to serve static assets
    try {
      // If we are in local dev, this might fail if assets aren't configured.
      // In production, 'ASSETS' binding is auto-injected for Pages/Workers Sites.
      if (env.ASSETS) {
        const isSpaRoute = !hasFileExtension && !docsPath;
        if (isSpaRoute) {
          // For client-side routes (for example /docs, /workflows/*), serve the SPA shell
          // directly to avoid ASSETS redirect behavior on extensionless paths.
          const fallbackRequest = new Request(new URL('/', url.origin), request);
          return await env.ASSETS.fetch(fallbackRequest);
        }

        const assetRequest = docsPath
          ? new Request(new URL(docsPath, url.origin), request)
          : request;
        const assetResponse = await env.ASSETS.fetch(assetRequest);
        if (assetResponse.status !== 404 || hasFileExtension) {
          return assetResponse;
        }

        // SPA fallback for client-side routes like /control-center/*
        const fallbackRequest = new Request(new URL('/', url.origin), request);
        return await env.ASSETS.fetch(fallbackRequest);
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

// Export all Durable Objects and Workflows
export * from './exports';
