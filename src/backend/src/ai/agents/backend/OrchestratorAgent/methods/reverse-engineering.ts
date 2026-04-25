/**
 * @file reverse-engineering.ts
 * @description Reverse-engineering orchestration methods for OrchestratorAgent.
 * Reverse-engineering orchestration and consultation methods for OrchestratorAgent.
 */

import type { OrchestratorAgent } from '../index';
import type { ReverseEngineeringAuthInput } from '@/lib/schemas/reverse-engineering';
import {
  runReverseEngineeringAnalysis,
  resumeReverseEngineeringAnalysis,
} from '@/services/reverse-engineering/orchestration';
import {
  runStructuredChat,
  type StructuredChatResult,
} from '@/ai/providers';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { getReverseEngineeringSnapshot } from '@/services/reverse-engineering/store';

// ── Reverse-Engineering Run ─────────────────────────────────────────────────

export interface ReverseEngineeringRunPayload {
  snapshotId: string;
  projectId?: string | null;
  owner: string;
  repo: string;
  repoUrl: string;
  branch?: string;
  frontendUrl?: string;
  auth?: ReverseEngineeringAuthInput;
  useSandboxPreview?: boolean;
  title?: string;
}

export async function runReverseEngineering(
  agent: OrchestratorAgent,
  payload: ReverseEngineeringRunPayload,
) {
  return runReverseEngineeringAnalysis((agent as any).env, {
    snapshotId: payload.snapshotId,
    projectId: payload.projectId || null,
    owner: payload.owner,
    repo: payload.repo,
    repoUrl: payload.repoUrl,
    branch: payload.branch || 'main',
    frontendUrl: payload.frontendUrl,
    auth: payload.auth,
    useSandboxPreview: payload.useSandboxPreview,
    title: payload.title,
  });
}

// ── Reverse-Engineering Resume ──────────────────────────────────────────────

export async function resumeReverseEngineering(
  agent: OrchestratorAgent,
  snapshotId: string,
  auth: ReverseEngineeringAuthInput,
  frontendUrl?: string,
) {
  return resumeReverseEngineeringAnalysis((agent as any).env, {
    snapshotId,
    auth,
    frontendUrl,
  });
}

// ── Reverse-Engineering Consult ─────────────────────────────────────────────

export interface ReverseEngineeringConsultPayload {
  snapshotId: string;
  role: 'general' | 'product' | 'ux' | 'frontend' | 'backend' | 'cloudflare';
  message: string;
  history?: Array<{ role: string; content: string }>;
  sessionId?: string;
  model?: string;
}

function buildRolePrompt(role: ReverseEngineeringConsultPayload['role']): string {
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
  if (role === 'cloudflare') return true;
  return /cloudflare|worker|workers|assets|d1|r2|kv|vectorize|browser rendering|ai gateway|wrangler|pages/i.test(message);
}

export async function consultReverseEngineering(
  agent: OrchestratorAgent,
  input: ReverseEngineeringConsultPayload,
): Promise<StructuredChatResult> {
  const snapshot = await getReverseEngineeringSnapshot((agent as any).env, input.snapshotId);
  if (!snapshot) {
    throw new Error(`Reverse engineering snapshot ${input.snapshotId} not found.`);
  }

  let cloudflareDocs: unknown = null;
  if (shouldQueryCloudflareDocs(input.role, input.message)) {
    try {
      const cloudflareAgent = (agent as any).getPeerAgent((agent as any).env.CLOUDFLARE_AGENT);
      const mcpResult = await cloudflareAgent.agenticSearch(
        `Provide Cloudflare implementation guidance for this request: ${input.message}`,
      );
      cloudflareDocs = mcpResult?.docsContext ?? null;
    } catch (err) {
      (agent as any).logger?.warn?.(`[ReverseEngineering] CloudflareAgent agenticSearch failed; continuing without docs context`, err);
      cloudflareDocs = null;
    }
  }

  const systemPrompt = withFullCodeOutputRules([
    'You are a reverse-engineering consultant embedded in the Colby orchestration platform.',
    buildRolePrompt(input.role),
    'Use the reverse-engineering snapshot as the primary source of truth.',
    'If Cloudflare documentation context is present, treat it as authoritative for platform-specific guidance.',
    'Be concrete. Reference route names, repo structure, APIs, bindings, UX evidence, and implementation tradeoffs.',
  ].join(' '));

  // The structured-chat helper needs an AgentStateStore, but since these are
  // stateless consult queries scoped to a snapshot, we use a minimal inline store.
  const { AgentStateStore } = await import('@/ai/providers');
  const store = new AgentStateStore({
    ctx: (agent as any).ctx,
    env: (agent as any).env,
    agentName: 'OrchestratorAgent:consult',
    initialState: {
      status: 'idle' as const,
      history: [],
      repoContext: null,
      mcpCache: {},
    },
  });

  return runStructuredChat({
    ai: (agent as any).ai,
    store,
    agentName: 'OrchestratorAgent:consult',
    systemPrompt,
    message: input.message,
    history: input.history || [],
    context: { snapshotId: input.snapshotId, snapshot, cloudflareDocs },
    source: 'reverse-engineering',
    sessionId: input.sessionId || input.snapshotId,
    requestedModel: input.model,
  });
}
