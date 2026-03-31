import { Hono } from 'hono';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runStructuredChat, type StructuredChatState, type StructuredChatResult } from '@/ai/agents/support/structured-chat';

const agentExports = createAgent<Env>({
  name: 'gemini',
  model: 'google-ai-studio/gemini-2.5-flash',
  system: 'You are an elite autonomous agent powered by Cloudflare AI Gateway. Provide structured, highly accurate responses.',
  binding: 'GEMINI_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'GeminiAgent',
    graphId: 'core-github-api-gemini',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'GeminiAgent' }));
app.get('/docs', (c) => c.text('Gemini Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'GeminiAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'GeminiAgent', version: '1.0.0' }, paths: {} }));
app.all('/*', (c) => agentExports.fetch(c.req.raw, c.env, c.executionCtx));

export default app;

const AgentDurableObject = agentExports.DurableObject as new (ctx: DurableObjectState, env: Env) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

type GeminiState = StructuredChatState;

export class GeminiAgent extends AgentDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<GeminiState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<GeminiState>({
      ctx,
      env,
      agentName: 'GeminiAgent',
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
      agentName: 'GeminiAgent',
      systemPrompt: 'You are an elite autonomous agent powered by Cloudflare AI Gateway. Provide structured, highly accurate responses.',
      message,
      history,
      context,
      source,
      sessionId,
      requestedModel,
    });
  }
}
