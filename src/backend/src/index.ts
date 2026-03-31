import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { handleStatelessMcpRequest } from '@/ai/mcp/http-handler';
import planningApi from '@/routes/api/planning';
import agentPlanningApi from '@/routes/api/agent-planning';
import reverseEngineeringApi from '@/routes/api/reverse-engineering';
import julesApi from '@/routes/api/jules';
import julesWebhookApi from '@/routes/api/webhooks/jules';
import actionsApi from '@/routes/api/actions';
import actionCallbackApi from '@/routes/api/webhooks/action-callback';
import actionWorkerWsApi from '@/routes/api/ws/action-worker';
import researchJudgeApi from '@/routes/api/webhooks/research-judge';
import researchOrchestrationApi from '@/routes/api/research-orchestration';
import aiGatewayApi from '@/routes/api/ai/gateway';
import commentsTools from '@/ai/mcp/tools/github/comments';
import skillsApi from '@/routes/api/skills';
import stitchApi from '@/routes/api/stitch';
import webhooksApi from '@/routes/api/webhooks/index';
import workflowsApi from '@/routes/api/ops/workflows';
import workshopApi from '@/routes/api/frontend/workshop';
import projectsApi from '@/routes/api/frontend/repos/index';
import todosApi from '@/routes/api/frontend/planner/todos';
import agentsApi from '@/routes/api/agents/index';
import alertsApi from '@/routes/api/frontend/alerts';
import settingsApi from '@/routes/api/frontend/settings';
import statsApi from '@/routes/api/frontend/stats';
import tasksApi from '@/routes/api/frontend/planner/tasks';
import timelineApi from '@/routes/api/frontend/planner/timeline';
import healthApi from '@/routes/api/ops/health';
import { standardizationRouter } from '@/routes/api/standardization';
import cloudflareApi from '@/routes/api/cloudflare/index';
import uxApi from '@/routes/api/ux/index';
import { docsAgentsRouter } from '@/routes/api/docs/agents';
import sentinelApi from '@/routes/api/sentinel';

type McpEnv = Pick<Env, 'STITCH_API_KEY' | 'JULES_API_KEY'>;

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

// --- 1. MCP Server Definition ---
function createOurMcpServer(env: McpEnv) {
  const server = new McpServer({ 
    name: 'Codex-Orchestrator-MCP', 
    version: '1.0.0' 
  });

  // Native Port: Assistant-UI Documentation
  server.tool(
    'assistant_ui_docs',
    'Search and retrieve documentation for the assistant-ui library',
    {
      query: z.string().describe('Search query for UI documentation'),
    },
    async ({ query }) => {
      // In a real implementation, you would fetch from a Vectorize index or remote doc source
      const simulatedDocs = `Simulated search results for assistant-ui query: ${query}\n\nTo implement a thread: use <Thread /> component.`;
      
      return {
        content: [{ type: 'text', text: simulatedDocs }]
      };
    }
  );

  // Native Port: Jules Planning
  server.tool(
    'generate_plan',
    'Generate a structured implementation plan using a dedicated Jules planning session',
    {
      description: z.string().describe('Detailed description of the plan you need generated'),
      sourceRepo: z.string().optional().describe('GitHub repository in owner/repo format (e.g., cloudflare/workers-sdk)'),
      baseBranch: z.string().optional().describe('Base branch for the pull request or context (e.g., main)'),
    },
    async ({ description, sourceRepo, baseBranch }) => {
      try {
        const { JulesService } = await import('@/services/jules/service');
        const jules = JulesService.getInstance(env as any);
        
        let contextText = '';
        if (sourceRepo) {
          contextText = `Context Repository: ${sourceRepo} on branch ${baseBranch || 'main'}\n`;
        }
        
        const prompt = `You are an expert software architect. Analyze the provided context and generate a comprehensive implementation plan for the following request:\n${contextText}\n${description}\n\nReturn the plan in structured markdown format.`;

        // The repoless session streams progress and captures generated files without auto-pr
        const outcome = await jules.runRepolessSession(prompt);

        return {
          content: [
            { type: 'text', text: `Plan session completed successfully.\n\nAgent output:\n${outcome.agentMessage || 'Plan generated successfully.'}\n\nFiles Details:\n${JSON.stringify(outcome.files, null, 2)}` }
          ]
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: 'text', text: `Planning failed: ${e.message}` }] };
      }
    }
  );

  // Native Port: Sequential Thinking
  server.tool(
    'sequential_thinking',
    'Process a logical thought sequence systematically',
    {
      thought: z.string().describe('The current thought or reasoning step'),
      stepNumber: z.number().describe('The current sequence number'),
      totalSteps: z.number().optional().describe('Estimated total steps in the sequence'),
    },
    async ({ thought, stepNumber }) => {
      // Ported logic replacing @modelcontextprotocol/server-sequential-thinking
      return {
        content: [
          { 
            type: 'text', 
            text: JSON.stringify({ status: 'recorded', step: stepNumber, thought, timestamp: Date.now() }) 
          }
        ]
      };
    }
  );

  // Remote Proxy: Google Stitch & Cloudflare Docs
  server.registerTool(
    'remote_mcp_proxy',
    {
      description: 'Execute a tool on a remote MCP server (cloudflare-docs or StitchMCP)',
      inputSchema: z.object({
        targetServer: z.enum(['cloudflare-docs', 'StitchMCP']).describe('The remote server to connect to'),
        toolName: z.string().describe('The specific tool to execute on the remote server'),
        parameters: z
          .record(z.string(), z.any())
          .describe('JSON arguments required by the remote tool'),
      }),
    },
    async ({ targetServer, toolName, parameters }) => {
      let url = '';
      const headers: Record<string, string> = {};
      const toTextContent = (value: unknown) => [
        {
          type: 'text' as const,
          text: typeof value === 'string' ? value : JSON.stringify(value),
        },
      ];

      if (targetServer === 'cloudflare-docs') {
        url = 'https://docs.mcp.cloudflare.com/mcp';
        // Implement disabledTools logic natively from configuration
        if (toolName === 'migrate_pages_to_workers_guide') {
          return {
            content: toTextContent('This tool is disabled by configuration.'),
          };
        }
      } else if (targetServer === 'StitchMCP') {
        url = 'https://stitch.googleapis.com/mcp';
        headers['X-Goog-Api-Key'] =
          typeof env.STITCH_API_KEY === 'string'
            ? env.STITCH_API_KEY
            : await env.STITCH_API_KEY.get();
      }

      const fetchWithHeaders: typeof fetch = (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            ...headers,
          },
        });

      const transport = new SSEClientTransport(new URL(url), {
        requestInit: { headers },
        eventSourceInit: { fetch: fetchWithHeaders },
        fetch: fetchWithHeaders,
      });
      const client = new Client({ name: `cf-worker-${targetServer}-proxy`, version: '1.0.0' }, { capabilities: {} });
      
      try {
        await client.connect(transport);
        const result = await client.callTool({ name: toolName, arguments: parameters });
        
        // Ensure we format the return payload strictly according to MCP Server standards
        return {
          content: toTextContent(result),
        };
      } catch (e: any) {
        return {
          isError: true,
          content: toTextContent(`Remote ${targetServer} execution failed: ${e.message}`),
        };
      } finally {
        await client.close();
      }
    }
  );

  // ── Jules MCP Tools (@google/jules-mcp) ──────────────────────────────────
  // @google/jules-mcp exports a JulesMCPServer class whose `_listTools()` method
  // returns the canonical list of tool schemas. We register each as a native
  // McpServer tool backed by JulesService.executeMCPTool().
  import('@google/jules-mcp').then(async ({ JulesMCPServer }) => {
    const { jules } = await import('@google/jules-sdk');
    const apiKey = await (env as any).JULES_API_KEY?.get?.() ?? '';
    const julesClient = jules.with({ apiKey });
    const mcpServer = new JulesMCPServer(julesClient as any);
    const { tools: rawTools } = mcpServer._listTools();

    for (const tool of rawTools) {
      try {
        server.tool(
          tool.name,
          (tool as any).description ?? '',
          (tool as any).inputSchema ?? {},
          async (args: Record<string, unknown>, _extra: any) => {
            const { JulesService } = await import('@/services/jules/service');
            const julesService = JulesService.getInstance(env as any);
            const result = await julesService.executeMCPTool(tool.name, args as Record<string, any>);
            return {
              content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
            };
          },
        );
      } catch {
        // Tool already registered in long-lived isolate — ignore duplicate
      }
    }
  }).catch(() => {
    // @google/jules-mcp not available at runtime — tools skipped
  });

  // ── Stitch MCP Tools (@google/stitch-sdk) ────────────────────────────────
  import('@/ai/mcp/tools/cloudflare/stitch').then(({ registerStitchTools }) => {
    registerStitchTools(server, env as any);
  }).catch(() => {
    // Stitch tools not resolvable at runtime — skip silently
  });

  return server;
}

// --- 2. Hono App & OpenAPI Setup ---
const app = new OpenAPIHono<{ Bindings: Env }>();

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { 
    title: 'Codex MCP Orchestrator API', 
    version: '1.0.0',
    description: 'Remote MCP Server utilizing the repo-local Honi-compatible agent runtime'
  },
});

app.get('/swagger', swaggerUI({ url: '/openapi.json' }));
app.get('/scalar', (c) => c.html(renderScalarReference('/openapi.json')));
// --- Operational Endpoints ---
export const routes = app
  .route('/api/agent-planning', agentPlanningApi)
  .route('/api/planning', planningApi)
  .route('/api/reverse-engineering', reverseEngineeringApi)
  .route('/api/jules', julesApi)
  .route('/api/webhooks/jules', julesWebhookApi)
  .route('/api/actions', actionsApi)
  .route('/api/webhooks/action-callback', actionCallbackApi)
  .route('/api/ws/action-worker', actionWorkerWsApi)
  .route('/api/webhooks/research-judge', researchJudgeApi)
  .route('/api/orchestration', researchOrchestrationApi)
  .route('/api/ai/gateway', aiGatewayApi)
  .route('/api/tools/comments', commentsTools)
  .route('/api/skills', skillsApi)
  .route('/api/stitch', stitchApi)
  .route('/api/webhooks', webhooksApi)
  .route('/api/workshop', workshopApi)
  .route('/api/projects', projectsApi)
  .route('/api/repos', projectsApi)
  .route('/api/frontend/todos', todosApi)
  .route('/api/alerts', alertsApi)
  .route('/api/settings', settingsApi)
  .route('/api/stats', statsApi)
  .route('/api/tasks', tasksApi)
  .route('/api/timeline', timelineApi)
  .route('/api/agents', agentsApi)
  .route('/api/health', healthApi)
  .route('/api/ops/workflows', workflowsApi)
  .route('/api/standardization', standardizationRouter)
  .route('/api/cloudflare', cloudflareApi)
  .route('/api/ux', uxApi)
  .route('/api/docs/agents', docsAgentsRouter)
  .route('/api/sentinel', sentinelApi);


export type AppType = typeof routes;

// --- Operational Endpoints ---
// Removed /health to unshadow the Astro page
app.get('/context', (c) => c.json({ environment: 'production', transport: 'streamable-http' }));
app.get('/docs', (c) => c.redirect('/scalar'));

// --- MCP Endpoint ---
// The root worker uses the MCP SDK's web-standard streamable HTTP transport
// directly instead of the unavailable `agents/mcp` package.
async function handleMcp(c: Context<{ Bindings: Env }>) {
  if (c.req.method !== 'POST') {
    return c.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST /mcp.' },
        id: null,
      },
      405,
    );
  }

  const server = createOurMcpServer(c.env);
  return handleStatelessMcpRequest(server, c.req.raw);
}

app.all('/mcp', handleMcp);
app.all('/mcp/*', handleMcp);

// --- StitchProxy Endpoint ---
// Accepts JSON-RPC MCP requests and forwards them to the Stitch API.
// forwardToStitch lives in @google/stitch-sdk but isn't re-exported in the
// package.json exports map, so we import via the resolved dist path.
app.all('/mcp/stitch', async (c) => {
  if (c.req.method !== 'POST') {
    return c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST /mcp/stitch' }, id: null }, 405);
  }
  try {
    // forwardToStitch is in the SDK runtime but not in the package.json exports map.
    // We access it via the publicly typed main import and extract at runtime.
    type ForwardFn = (config: { apiKey: string }, method: string, params?: unknown) => Promise<unknown>;
    const stitchMod = await import('@google/stitch-sdk');
    // The main export re-exports proxy utilities at runtime; extract with runtime key access
    const forwardToStitch = (stitchMod as Record<string, unknown>)['forwardToStitch'] as ForwardFn | undefined;

    const rawKey = c.env.STITCH_API_KEY;
    const apiKey = typeof rawKey === 'string' ? rawKey : await (rawKey as any).get();

    if (typeof forwardToStitch !== 'function') {
      return c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'forwardToStitch not available in this SDK build' }, id: null }, 501);
    }

    const body = await c.req.json() as { method?: string; params?: unknown; id?: unknown };
    const method = body.method ?? 'tools/list';
    const params = body.params ?? {};

    const result = await forwardToStitch({ apiKey }, method, params);
    return c.json({ jsonrpc: '2.0', result, id: body.id ?? null });
  } catch (e: any) {
    return c.json({ jsonrpc: '2.0', error: { code: -32000, message: e.message }, id: null }, 500);
  }
});

app.notFound(async (c) => {
  console.log("Hono 404 fallback invoked for:", c.req.method, c.req.url);
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    let res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404) {
      const url = new URL(c.req.url);
      url.pathname = '/';
      res = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw as RequestInit));
    }
    return res;
  }

  return c.json({ error: 'Not found', path: c.req.url }, 404);
});

export default app;

export { Sandbox } from '@cloudflare/sandbox';
export { OrchestratorAgent } from '@/ai/agents/Orchestrator';
export { RetrofitAgent } from '@/ai/agents/retrofit';
export { RoomDO } from '@/do/RoomDO';
export { GeminiAgent } from '@/ai/agents/Gemini';
export { PlannerAgent } from '@/ai/agents/Planner';
export { RepoAgent } from '@/ai/agents/github/Repo';
export { Supervisor } from '@/ai/agents/Supervisor';
export { DeepReasoningAgent } from '@/ai/agents/DeepReasoning';
export { OwnerAgent } from '@/ai/agents/github/Owner';
export { ResearchAgent } from '@/ai/agents/Research';
export { DiscordResearchAgent } from '@/ai/agents/research/DiscordResearch';
export { JulesOverseer } from '@/ai/agents/JulesOverseer';
export { TopicOrchestratorAgent } from '@/ai/agents/TopicOrchestrator';
export { WebSearchAgent } from '@/ai/agents/WebSearch';
export { JudgeAgent } from '@/ai/agents/Judge';
export { ReportingAgent } from '@/ai/agents/Reporting';
export { LandingPageAgent } from '@/ai/agents/LandingPageAgent';
export { CloudflareDocsAgent } from '@/ai/agents/CloudflareDocs';
export { DeepResearchChatAgent } from '@/ai/agents/DeepResearchChat';
export { HealthDiagnostician } from '@/ai/agents/HealthDiagnostician';
export { JulesWebhookBroadcaster } from '@/do/JulesWebhookBroadcaster';
export { PlanningMonitor } from '@/do/PlanningMonitor';
export { ReverseEngineeringMonitor } from '@/do/ReverseEngineeringMonitor';
export { PlanningSupervisorAgent } from '@/ai/agents/planning/Supervisor';
export { PlanningOrchestratorAgent } from '@/ai/agents/planning/Orchestrator';
export { HoniOrchestrator } from '@/ai/agents/reverse-engineering/Orchestrator';
export { HoniConsultant } from '@/ai/agents/reverse-engineering/Consultant';
export { WorkshopAgent } from '@/ai/agents/workshop/WorkshopAgent';
export { CfWorkshop_AgentsSdk } from '@/ai/agents/workshop/CfAgentsSdk';
export { UxDesignAgent } from '@/ai/agents/UxDesignAgent';
export { StandardizationAgent } from '@/ai/agents/StandardizationAgent';
export { GithubSearchWorkflow } from '@/workflows/search';
export { DeepResearchWorkflow } from '@/workflows/research/deep';
export { DiscordResearchWorkflow } from '@/workflows/research/discord';
export { ResearchOrchestrator } from '@/workflows/research/orchestrator';
export { TopicResearchWorkflow } from '@/workflows/research/topic';
export { PlanningOrchestrator } from '@/workflows/planning/orchestrator';
export { AgentSessionDO } from '@/do/AgentSessionDO';
export { LearningAgent } from '@/ai/agents/LearningAgent';
export { StitchLoopWorkflow } from '@/workflows/planning/stitch-loop';
