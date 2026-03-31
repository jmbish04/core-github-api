/**
 * CloudflareDocsAgent — Specialized Cloudflare Documentation Expert.
 */

import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { CF_DOCS_PROMPT_KV_KEY } from '@/ai/agents/constants';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import {
  runStructuredChat,
  type ContentBlock,
  type StructuredChatResult,
  type StructuredChatState,
} from '@/ai/agents/support/structured-chat';
import { makeQueryStandardsTool } from '@/ai/tools/standards';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';

export type { ContentBlock };
export type CloudflareDocsChatResult = StructuredChatResult;

export const SYSTEM_PROMPT_BASE = withFullCodeOutputRules(`You are an expert Cloudflare Support Engineer and Systems Architect.

You have been provided with relevant Cloudflare documentation. Use it as your primary reference.
Be specific, precise, and include working TypeScript code examples targeting Cloudflare Workers (nodejs_compat mode).`);

const cloudflareDocsRuntime = createAgent<Env>({
  name: 'cloudflare-docs',
  model: 'google-ai-studio/gemini-2.5-flash',
  system: SYSTEM_PROMPT_BASE,
  binding: 'CLOUDFLARE_DOCS_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'CloudflareDocsAgent',
    graphId: 'core-github-api-cloudflare-docs',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const CloudflareDocsDurableObject = cloudflareDocsRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

type CloudflareDocsState = StructuredChatState;

export class CloudflareDocsAgent extends CloudflareDocsDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<CloudflareDocsState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<CloudflareDocsState>({
      ctx,
      env,
      agentName: 'CloudflareDocsAgent',
      initialState: {
        repoContext: null,
        status: 'idle',
        history: [],
        mcpCache: {},
      },
    });
  }

  private async getSystemPromptBase(): Promise<string> {
    let resolvedPrompt = SYSTEM_PROMPT_BASE;
    try {
      const kvRaw = await (this.env as any).KV_CONFIGS.get(CF_DOCS_PROMPT_KV_KEY);
      if (kvRaw) {
        let parsed: any = null;
        try {
          parsed = JSON.parse(kvRaw);
        } catch (error) {
          console.error('[CloudflareDocsAgent] KV_CONFIGS key is a raw string, using as-is', JSON.stringify(error));
        }
        const fromKv = parsed && typeof parsed === 'object' && 'value' in parsed ? parsed.value : kvRaw;
        if (typeof fromKv === 'string' && fromKv.length > 20) {
          resolvedPrompt = fromKv;
        }
      }
    } catch {
      // KV unavailable — fall through.
    }

    try {
      const tool = makeQueryStandardsTool(this.env as any) as any;
      const dynamicStandards = await tool.handler({});
      return `${resolvedPrompt}\n\n═══════════════════════════════════════════════════════\nREPOSITORY STANDARDIZATION RULES\n═══════════════════════════════════════════════════════\n${dynamicStandards}`;
    } catch (error) {
      console.error('[CloudflareDocsAgent] Failed to inject dynamic standards', error);
      return resolvedPrompt;
    }
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
      agentName: 'CloudflareDocsAgent',
      systemPrompt,
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
