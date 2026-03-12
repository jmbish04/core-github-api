/**
 * CfWorkshop_AgentsSdk — Agent Factory & Mechanic.
 */
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runStructuredChat, type StructuredChatResult, type StructuredChatState } from '@/ai/agents/support/structured-chat';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';

export interface WorkshopAgentState extends StructuredChatState {
  projectScaffolded?: boolean;
}

const workshopSchema = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      description: 'Ordered response blocks.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['section_header', 'text', 'codeblock'] },
          text: { type: 'string' },
          language: { type: 'string' },
        },
        required: ['type', 'text'],
      },
      minItems: 1,
    },
    followupPrompts: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 5,
    },
    agentType: {
      type: 'string',
      enum: ['scaffold', 'debug', 'review', 'general'],
    },
    codeFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  required: ['blocks', 'followupPrompts'],
};

const workshopAgentsSdkRuntime = createAgent<Env>({
  name: 'cf-workshop-agents-sdk',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are a Senior AI Systems Architect and the ultimate mechanic for Cloudflare Agents.',
  binding: 'CF_WORKSHOP_AGENTS_SDK',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'CfWorkshop_AgentsSdk',
    graphId: 'core-github-api-cf-workshop-agents-sdk',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const WorkshopAgentsSdkDurableObject = workshopAgentsSdkRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class CfWorkshop_AgentsSdk extends WorkshopAgentsSdkDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<WorkshopAgentState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<WorkshopAgentState>({
      ctx,
      env,
      agentName: 'CfWorkshop_AgentsSdk',
      initialState: {
        repoContext: null,
        status: 'idle',
        history: [],
        mcpCache: {},
        projectScaffolded: false,
      },
    });
  }

  private async getSystemPromptBase(): Promise<string> {
    return withFullCodeOutputRules(`You are a Senior AI Systems Architect and the ultimate mechanic for Cloudflare Agents.

Your primary mission is to help users design, scaffold, and debug sophisticated Agentic Systems on Cloudflare's Developer Platform.
You act as a factory capable of generating fully operational Cloudflare Workers using the latest practical best practices.

Key expectations:
- Honi-compatible agent runtime under \`@/ai/agents/honi\`.
- Durable Object memory uses \`new_sqlite_classes\` migrations.
- Cloudflare AI Gateway fronts external providers.
- assistant-ui style frontend chat integrations.
- Drizzle ORM for D1-backed persistence.
- pnpm, wrangler.jsonc, and worker-configuration.d.ts conventions.`);
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
      agentName: 'CfWorkshop_AgentsSdk',
      systemPrompt,
      message,
      history,
      context,
      source,
      sessionId,
      requestedModel,
      responseSchema: workshopSchema,
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

    return super.fetch(request);
  }
}
