import { BaseChatAgent } from '@/ai/providers/agent-support/base-chat-agent';
import { callable, StreamingResponse } from 'agents';
import { getAgentByName } from 'agents';
import type { CoordinatorState } from './types';

/**
 * CoordinatorAgent — Frontend triage broker.
 *
 * CONTRACT (enforced by lint; see docs/20260417/standardize_agents/v7/PRD.md C9):
 * - This agent is a PURE ROUTER. It must never call an external service directly.
 * - Allowed imports: `agents`, `@/ai/providers/agent-support/base-chat-agent`, local types.
 * - Forbidden imports: @octokit/*, @/ai/mcp/*, @/cloudflare/*, @services/*, any third-party SDK.
 * - All domain work routes to a backend specialist via `this.getPeerAgent<T>(this.env.FOO_AGENT)`.
 * - If you need new functionality here, add a new @callable on the relevant specialist first.
 *
 * @see .agent/rules/agent-specialist-delegation.md
 */
export class CoordinatorAgent extends BaseChatAgent<CoordinatorState> {
  protected get agentName(): string {
    return 'CoordinatorAgent';
  }

  protected get skills(): string[] {
    return ['proactive-intelligence'];
  }

  protected async agentInit(): Promise<void> {
    this.logger.info('CoordinatorAgent initialized');
  }

  protected async initializeState(): Promise<CoordinatorState> {
    return {
      status: 'idle',
      history: [],
      currentContextId: undefined,
    };
  }

  /**
   * Relay requests to backend agents using strict RPC and pipe back the SSE
   * compliant StreamingResponse to the generic chat client.
   */
  @callable({ streaming: true })
  async handleStream(stream: StreamingResponse, message: string): Promise<void> {
    try {
      // NOTE: Here we would perform intent parsing to route to the correct peer.
      // Example routing fallback pattern:
      
      // Let's connect directly to Orchestrator to handle complex breakdown for now:
      const peer = this.getPeerAgent<any>(this.env.ORCHESTRATOR_AGENT);
      
      // Safely proxy via stream RPC if Orchestrator exposes it:
      await stream.send(`[Coordinator] Relaying your message to the Orchestrator...\n`);
      
      // A full implementation would utilize `await peer.call('method', [message], { onChunk: (c) => stream.send(c) })`
      // Mocking response for architecture validation:
      await stream.send(`[Coordinator] Backend processed: ${message.substring(0, 50)}...\n`);
      
    } catch (err: any) {
      this.logger.error('Stream routing failed in CoordinatorAgent', err);
      await stream.send(`[Coordinator Error] ${err?.message}`);
    }
  }

  // Placeholder methods required by abstract BaseChatAgent if any
  public async getAvailableTools() {
    return []; 
  }

  public async getSystemPrompt() {
    return `You are the CoordinatorAgent. You act as the seamless front-door interface connecting users to specialized Cloudflare backend agents.`;
  }
}
