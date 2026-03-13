import { z } from 'zod';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import {
  runStructuredChat,
  type StructuredChatResult,
  type StructuredChatState,
} from '@/ai/agents/support/structured-chat';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { queryMCP } from '@/ai/mcp/mcp-client';
import { getReverseEngineeringSnapshot } from '@/services/reverse-engineering/store';

const ReverseEngineeringConsultSchema = z.object({
  snapshotId: z.string(),
  role: z.enum(['general', 'product', 'ux', 'frontend', 'backend', 'cloudflare']).default('general'),
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      }),
    )
    .default([]),
  sessionId: z.string().optional(),
  model: z.string().optional(),
});

const consultantRuntime = createAgent<Env>({
  name: 'honi-consultant',
  model: 'claude-sonnet-4-5',
  system: 'You are the reverse-engineering consultant agent.',
  binding: 'HONI_CONSULTANT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'HoniConsultant',
    semanticBinding: 'RESEARCH_INDEX',
    graphId: 'core-github-api-reverse-engineering-consultant',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const ConsultantDurableObject = consultantRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

type ReverseEngineeringConsultantState = StructuredChatState & {
  activeSnapshotId?: string | null;
  activeRole?: string | null;
};

function buildRolePrompt(role: z.infer<typeof ReverseEngineeringConsultSchema>['role']): string {
  switch (role) {
    case 'product':
      return 'Focus on product intent, requirements, PRD quality, user stories, and epic boundaries.';
    case 'ux':
      return 'Focus on user journeys, page flows, interaction design, and screenshot-derived UX implications.';
    case 'frontend':
      return 'Focus on frontend architecture, route composition, component layering, state, and integration risks.';
    case 'backend':
      return 'Focus on backend routes, data model, integrations, auth boundaries, and deployment architecture.';
    case 'cloudflare':
      return 'Focus on Cloudflare Workers, Assets, D1, R2, Vectorize, AI Gateway, Browser Rendering, and platform-fit recommendations.';
    default:
      return 'Provide balanced guidance across product, UX, frontend, backend, and infrastructure.';
  }
}

function shouldQueryCloudflareDocs(role: string, message: string): boolean {
  if (role === 'cloudflare') {
    return true;
  }

  return /cloudflare|worker|workers|assets|d1|r2|kv|vectorize|browser rendering|ai gateway|wrangler|pages/i.test(
    message,
  );
}

export class HoniConsultant extends ConsultantDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<ReverseEngineeringConsultantState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<ReverseEngineeringConsultantState>({
      ctx,
      env,
      agentName: 'HoniConsultant',
      initialState: {
        status: 'idle',
        history: [],
        repoContext: null,
        mcpCache: {},
        activeSnapshotId: null,
        activeRole: null,
      },
    });
  }

  private async buildContext(snapshotId: string, role: string, message: string) {
    const snapshot = await getReverseEngineeringSnapshot(this.env, snapshotId);
    if (!snapshot) {
      throw new Error(`Reverse engineering snapshot ${snapshotId} not found.`);
    }

    let cloudflareDocs: unknown = null;
    if (shouldQueryCloudflareDocs(role, message)) {
      cloudflareDocs = await queryMCP(
        `Provide Cloudflare implementation guidance for this request: ${message}`,
        'HoniConsultant',
        this.env.MCP_API_URL,
      );
    }

    return {
      snapshotId,
      snapshot,
      cloudflareDocs,
    };
  }

  private async getSystemPrompt(role: z.infer<typeof ReverseEngineeringConsultSchema>['role']) {
    return withFullCodeOutputRules([
      'You are HoniConsultant, a reverse-engineering consultant embedded in a Cloudflare-native development toolkit.',
      buildRolePrompt(role),
      'Use the reverse-engineering snapshot as the primary source of truth.',
      'If Cloudflare documentation context is present, treat it as authoritative for platform-specific guidance.',
      'Be concrete. Reference route names, repo structure, APIs, bindings, UX evidence, and implementation tradeoffs.',
    ].join(' '));
  }

  async chat(input: z.infer<typeof ReverseEngineeringConsultSchema>): Promise<StructuredChatResult> {
    const context = await this.buildContext(input.snapshotId, input.role, input.message);
    const systemPrompt = await this.getSystemPrompt(input.role);

    return runStructuredChat({
      env: this.env,
      store: this.store,
      agentName: 'HoniConsultant',
      systemPrompt,
      message: input.message,
      history: input.history,
      context,
      source: 'reverse-engineering',
      sessionId: input.sessionId || input.snapshotId,
      requestedModel: input.model,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/chat') {
      const payload = ReverseEngineeringConsultSchema.parse(await request.json());
      const result = await this.chat(payload);
      return Response.json({ success: true, ...result });
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', agent: 'HoniConsultant' });
    }

    if (url.pathname === '/docs') {
      return new Response('Reverse Engineering Consultant Agent API');
    }

    if (url.pathname === '/context') {
      return Response.json({ environment: 'Cloudflare Workers', agent: 'HoniConsultant' });
    }

    if (url.pathname === '/openapi.json') {
      return Response.json({
        openapi: '3.1.0',
        info: { title: 'HoniConsultant', version: '1.0.0' },
        paths: {},
      });
    }

    return super.fetch(request);
  }
}
