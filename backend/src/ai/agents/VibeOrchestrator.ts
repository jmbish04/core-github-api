import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { queryMCP } from '../mcp/mcp-client';
import { dispatchToJules } from '../../services/jules/dispatcher';

const agentObj = createAgent({
  name: 'vibe-orchestrator',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are the Vibe Orchestrator. You receive high-level requirements and break them into modular tasks for the Jules coding engine. You must consult Cloudflare Docs MCP for architectural best practices before finalizing any plan.',
  binding: 'VIBE_ORCHESTRATOR_DO',
  memory: {
    enabled: true,
    episodic: { enabled: true, binding: 'DB' }
  },
  observability: {
    aiGateway: { accountId: "core-gateway", gatewayId: "core-gateway" }
  },
  tools: [
    tool({
      name: 'query_cloudflare_docs',
      description: 'Query Cloudflare documentation via MCP for the latest SDK and API patterns.',
      input: z.object({ query: z.string() }) as any,
      handler: async ({ query }, ctx) => {
        return await queryMCP(query);
      }
    }),
    tool({
      name: 'dispatch_to_jules',
      description: 'Dispatch a planned task to the Jules coding engine for execution.',
      input: z.object({ taskName: z.string(), description: z.string() }) as any,
      handler: async ({ taskName, description }, ctx) => {
        await dispatchToJules(ctx!.env as any, description);
        return { dispatched: true, taskName, status: 'pending_jules_execution' };
      }
    })
  ]
});

export class VibeOrchestratorDO extends agentObj.DurableObject {}
export const vibeOrchestratorHandler = agentObj.fetch;
