/**
 * @file ai/mcp/index.ts
 * @description MCP server factory and Hono endpoint mounting.
 *
 * Consolidates:
 *  - Native MCP tools (assistant_ui_docs, generate_plan, sequential_thinking, remote_mcp_proxy)
 *  - Jules MCP dynamic registration (@google/jules-mcp)
 *  - Stitch MCP dynamic registration (@/ai/mcp/tools/cloudflare/stitch)
 *  - /mcp and /mcp/stitch Hono route handlers
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { z } from 'zod';
import { handleStatelessMcpRequest } from './http-handler';

type McpEnv = Pick<Env, 'STITCH_API_KEY' | 'JULES_API_KEY'>;

// ---------------------------------------------------------------------------
// MCP Server Factory
// ---------------------------------------------------------------------------

function createOurMcpServer(env: McpEnv) {
  const server = new McpServer({
    name: 'Codex-Orchestrator-MCP',
    version: '1.0.0',
  });

  // ── Native: Assistant-UI Documentation ──────────────────────────────────
  server.tool(
    'assistant_ui_docs',
    'Search and retrieve documentation for the assistant-ui library',
    {
      query: z.string().describe('Search query for UI documentation'),
    },
    async ({ query }) => {
      const simulatedDocs = `Simulated search results for assistant-ui query: ${query}\n\nTo implement a thread: use <Thread /> component.`;
      return {
        content: [{ type: 'text', text: simulatedDocs }],
      };
    },
  );

  // ── Native: Jules Planning ──────────────────────────────────────────────
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

        const outcome = await jules.runRepolessSession(prompt);

        return {
          content: [
            {
              type: 'text',
              text: `Plan session completed successfully.\n\nAgent output:\n${outcome.agentMessage || 'Plan generated successfully.'}\n\nFiles Details:\n${JSON.stringify(outcome.files, null, 2)}`,
            },
          ],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: 'text', text: `Planning failed: ${e.message}` }] };
      }
    },
  );

  // ── Native: Sequential Thinking ─────────────────────────────────────────
  server.tool(
    'sequential_thinking',
    'Process a logical thought sequence systematically',
    {
      thought: z.string().describe('The current thought or reasoning step'),
      stepNumber: z.number().describe('The current sequence number'),
      totalSteps: z.number().optional().describe('Estimated total steps in the sequence'),
    },
    async ({ thought, stepNumber }) => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'recorded', step: stepNumber, thought, timestamp: Date.now() }),
          },
        ],
      };
    },
  );

  // ── Remote Proxy: Google Stitch & Cloudflare Docs ───────────────────────
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
    },
  );

  // ── Jules MCP Tools (@google/jules-mcp) ─────────────────────────────────
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

  // ── Stitch MCP Tools (@google/stitch-sdk) ───────────────────────────────
  import('./tools/cloudflare/stitch').then(({ registerStitchTools }) => {
    registerStitchTools(server, env as any);
  }).catch(() => {
    // Stitch tools not resolvable at runtime — skip silently
  });

  // ── Sentinel Tools (agent task management via /api/projects/sentinel/*) ──
  import('@/routes/api/projects/sentinel/mcp').then(({ registerSentinelMcpTools }) => {
    registerSentinelMcpTools(server, env as any);
  }).catch(() => {
    // Should always resolve — log if not
    console.warn('[MCP] Failed to register Sentinel tools');
  });

  return server;
}

// ---------------------------------------------------------------------------
// Hono MCP Route Handlers
// ---------------------------------------------------------------------------

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

async function handleStitchProxy(c: Context<{ Bindings: Env }>) {
  if (c.req.method !== 'POST') {
    return c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST /mcp/stitch' }, id: null }, 405);
  }
  try {
    type ForwardFn = (config: { apiKey: string }, method: string, params?: unknown) => Promise<unknown>;
    const stitchMod = await import('@google/stitch-sdk');
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
}

// ---------------------------------------------------------------------------
// Public Mount Function
// ---------------------------------------------------------------------------

/**
 * Mount all MCP-related endpoints onto the Hono app:
 *  - POST /mcp       → stateless MCP request handler
 *  - POST /mcp/stitch → Stitch proxy
 */
export function mountMcpEndpoints(app: OpenAPIHono<{ Bindings: Env }>) {
  app.all('/mcp', handleMcp);
  app.all('/mcp/*', handleMcp);
  app.all('/mcp/stitch', handleStitchProxy);
}
