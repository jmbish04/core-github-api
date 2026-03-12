/**
 * Deep Research Chat Agent built directly on Honi.
 */

import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import {
  runStructuredChat,
  BASE_RESPONSE_SCHEMA,
  type StructuredChatResult,
  type StructuredChatState,
} from '@/ai/agents/support/structured-chat';

export interface DeepResearchChatState extends StructuredChatState {
  currentDataset?: unknown;
}

const deepResearchChatRuntime = createAgent<Env>({
  name: 'deep-research-chat',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are a Deep Research orchestrator and analytical assistant.',
  binding: 'DEEP_RESEARCH_CHAT_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'DeepResearchChatAgent',
    graphId: 'core-github-api-deep-research-chat',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const DeepResearchChatDurableObject = deepResearchChatRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class DeepResearchChatAgent extends DeepResearchChatDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<DeepResearchChatState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<DeepResearchChatState>({
      ctx,
      env,
      agentName: 'DeepResearchChatAgent',
      initialState: {
        status: 'idle',
        history: [],
        repoContext: null,
        mcpCache: {},
      },
    });
  }

  private async getSystemPromptBase(): Promise<string> {
    return `You are a Deep Research orchestrator and analytical assistant.

Your primary role is to help users initiate, explore, and analyze deep research workflows built on the repo-local Honi-compatible agent stack.
You excel at discussing repository architecture, analyzing source code, setting up research goals, and evaluating findings across complex codebases.

When users interact with you, provide structured, thoughtful responses:
- Present architectural patterns and code clearly.
- Offer strategic insights and suggestions for deep dive analysis.
- Summarize key complexities or trade-offs succinctly.

Feel free to break down complicated research steps into highly readable explanations.
Always adhere to the specific response format constraints below.`;
  }

  async chat(
    message: string,
    history: unknown[] = [],
    context?: unknown,
    source = 'api',
    sessionId = 'default',
    requestedModel?: string,
  ): Promise<StructuredChatResult> {
    const systemPrompt = await this.getSystemPromptBase();
    return runStructuredChat({
      env: this.env,
      store: this.store,
      agentName: 'DeepResearchChatAgent',
      systemPrompt,
      message,
      history,
      context,
      source,
      sessionId,
      requestedModel,
      responseSchema: BASE_RESPONSE_SCHEMA,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/chat') {
      const payload = await request.json<{
        message?: string;
        history?: unknown[];
        context?: unknown;
        source?: string;
        sessionId?: string;
        model?: string;
      }>();

      const result = await this.chat(
        payload.message || '',
        payload.history || [],
        payload.context,
        payload.source || 'api',
        payload.sessionId || 'default',
        payload.model,
      );
      return Response.json(result);
    }

    return super.fetch(request);
  }
}
