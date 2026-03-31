/**
 * Retrofit agent Durable Object.
 */

import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runStructuredChat, type StructuredChatResult, type StructuredChatState } from '@/ai/agents/support/structured-chat';

const retrofitRuntime = createAgent<Env>({
  name: 'retrofit',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are RetrofitAgent, a repository retrofit specialist for Cloudflare Worker applications.',
  binding: 'RetrofitAgent',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'RetrofitAgent',
    graphId: 'core-github-api-retrofit',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const RetrofitDurableObject = retrofitRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class RetrofitAgent extends RetrofitDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<StructuredChatState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<StructuredChatState>({
      ctx,
      env,
      agentName: 'RetrofitAgent',
      initialState: {
        status: 'idle',
        history: [],
        repoContext: null,
        mcpCache: {},
      },
    });
  }

  async chat(
    message: string,
    history: unknown[] = [],
    context?: unknown,
    source = 'api',
    sessionId = 'default',
    requestedModel?: string,
  ): Promise<StructuredChatResult> {
    return runStructuredChat({
      env: this.env,
      store: this.store,
      agentName: 'RetrofitAgent',
      systemPrompt: 'You are RetrofitAgent, a repository retrofit specialist for Cloudflare Worker applications.',
      message,
      history,
      context,
      source,
      sessionId,
      requestedModel,
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
      return Response.json(
        await this.chat(
          payload.message || '',
          payload.history || [],
          payload.context,
          payload.source || 'api',
          payload.sessionId || 'default',
          payload.model,
        ),
      );
    }

    if (url.pathname === '/not-yet-implemented') {
      return new Response('RetrofitAgent - not yet implemented', { status: 501 });
    }

    return super.fetch(request);
  }
}
