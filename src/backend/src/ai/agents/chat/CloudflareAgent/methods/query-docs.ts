/**
 * @file CloudflareAgent/methods/query-docs.ts
 * @description Absorbed from CloudflareDocs.ts — Queries Cloudflare documentation
 *              via KV-stored system prompts and dynamic standardization rules.
 *              Exposed as @callable RPC for GuardrailAgent, EngineerAgent, LearningAgent.
 */

import {
  CF_DOCS_PROMPT_KV_KEY,
  runStructuredChat,
  type StructuredChatResult,
  type AIProvider,
  type AgentStateStore,
} from '@/ai/providers';
import { makeQueryStandardsTool } from '@/ai/mcp/tools/standards';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import type { CloudflareAgentState } from '../types';

export const SYSTEM_PROMPT_BASE = withFullCodeOutputRules(
  `You are an expert Cloudflare Support Engineer and Systems Architect.

You have been provided with relevant Cloudflare documentation. Use it as your primary reference.
Be specific, precise, and include working TypeScript code examples targeting Cloudflare Workers (nodejs_compat mode).`,
);

/**
 * Resolves the system prompt from KV and appends dynamic standardization rules.
 */
export async function getDocsSystemPrompt(env: Env): Promise<string> {
  let resolvedPrompt = SYSTEM_PROMPT_BASE;

  // Attempt KV override
  try {
    const kvRaw = await (env as any).KV_CONFIGS.get(CF_DOCS_PROMPT_KV_KEY);
    if (kvRaw) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(kvRaw);
      } catch {
        // KV value is raw string — use as-is.
      }
      const fromKv =
        parsed && typeof parsed === 'object' && 'value' in parsed ? parsed.value : kvRaw;
      if (typeof fromKv === 'string' && fromKv.length > 20) {
        resolvedPrompt = fromKv;
      }
    }
  } catch {
    // KV unavailable — fall through.
  }

  // Append dynamic standardization rules
  try {
    const tool = makeQueryStandardsTool(env as any) as any;
    const dynamicStandards = await tool.handler({});
    return `${resolvedPrompt}\n\n═══════════════════════════════════════════════════════\nREPOSITORY STANDARDIZATION RULES\n═══════════════════════════════════════════════════════\n${dynamicStandards}`;
  } catch {
    return resolvedPrompt;
  }
}

/**
 * Runs a chat query against the Cloudflare documentation knowledge base.
 */
export async function queryDocs(
  ai: AIProvider,
  store: AgentStateStore<CloudflareAgentState>,
  env: Env,
  message: string,
  history: unknown[] = [],
  context?: unknown,
  source = 'api',
  sessionId = 'default',
  requestedModel?: string,
): Promise<StructuredChatResult> {
  const systemPrompt = await getDocsSystemPrompt(env);
  return runStructuredChat({
    ai,
    store,
    agentName: 'CloudflareAgent',
    systemPrompt,
    message,
    history,
    context,
    source,
    sessionId,
    requestedModel,
    skills: ['cloudflare-docs', 'workers-architecture', 'debugging'],
  });
}
