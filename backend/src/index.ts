import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { apiReference } from '@scalar/hono-api-reference';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export type Env = {
  STITCH_API_KEY: string;
};

// --- 1. MCP Server Definition ---
function createOurMcpServer(env: Env) {
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
  server.tool(
    'remote_mcp_proxy',
    'Execute a tool on a remote MCP server (cloudflare-docs or StitchMCP)',
    {
      targetServer: z.enum(['cloudflare-docs', 'StitchMCP']).describe('The remote server to connect to'),
      toolName: z.string().describe('The specific tool to execute on the remote server'),
      parameters: z.record(z.any()).describe('JSON arguments required by the remote tool'),
    },
    async ({ targetServer, toolName, parameters }) => {
      let url = '';
      const headers: Record<string, string> = {};

      if (targetServer === 'cloudflare-docs') {
        url = 'https://docs.mcp.cloudflare.com/mcp';
        // Implement disabledTools logic natively from configuration
        if (toolName === 'migrate_pages_to_workers_guide') {
          return {
            content: [{ type: 'text', text: 'This tool is disabled by configuration.' }]
          };
        }
      } else if (targetServer === 'StitchMCP') {
        url = 'https://stitch.googleapis.com/mcp';
        headers['X-Goog-Api-Key'] = env.STITCH_API_KEY;
      }

      const transport = new SSEClientTransport(new URL(url), { headers });
      const client = new Client({ name: `cf-worker-${targetServer}-proxy`, version: '1.0.0' }, { capabilities: {} });
      
      try {
        await client.connect(transport);
        const result = await client.callTool({ name: toolName, arguments: parameters });
        
        // Ensure we format the return payload strictly according to MCP Server standards
        return {
          content: result.content || [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Remote ${targetServer} execution failed: ${e.message}` }]
        };
      } finally {
        await client.close();
      }
    }
  );

  return server;
}

// --- Sentinel API ---
import sentinelApi from './routes/api/sentinel';

// --- 2. Hono App & OpenAPI Setup ---
const app = new OpenAPIHono<{ Bindings: Env }>();

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { 
    title: 'Codex MCP Orchestrator API', 
    version: '1.0.0',
    description: 'Remote MCP Server utilizing Cloudflare Agents SDK'
  },
});

app.get('/swagger', swaggerUI({ url: '/openapi.json' }));
app.get('/scalar', apiReference({ spec: { url: '/openapi.json' } }));

// --- Operational Endpoints ---
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/context', (c) => c.json({ environment: 'production', transport: 'streamable-http' }));
app.get('/docs', (c) => c.redirect('/scalar'));

// --- Sentinel API Routes ---
app.route('/api/sentinel', sentinelApi);

// --- MCP Endpoint ---
// We use app.all to capture both GET (SSE/Discovery) and POST (RPC execution) traffic 
// routed through the official createMcpHandler.
app.all('/mcp/*', async (c) => {
  const server = createOurMcpServer(c.env);
  const mcpHandler = createMcpHandler(server);
  
  // Pass the raw Request, environment, and ExecutionContext down to the Agents SDK handler
  return mcpHandler(c.req.raw, c.env, c.executionCtx);
});

export default app;
