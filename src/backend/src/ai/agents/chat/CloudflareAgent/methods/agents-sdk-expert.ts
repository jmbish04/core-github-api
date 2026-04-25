/**
 * @file CloudflareAgent/methods/agents-sdk-expert.ts
 * @description Absorbed from CfAgentsSdk.ts — Expert advisor on Cloudflare Agents SDK
 *              best practices, scaffolding, and code review for agent compliance.
 */

import {
  runStructuredChat,
  type StructuredChatResult,
  type AIProvider,
  type AgentStateStore,
} from '@/ai/providers';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { workshopResponseSchema } from '../types';
import type { CloudflareAgentState } from '../types';

let _systemPromise: Promise<string> | null = null;

/**
 * Builds the system prompt with skill context for Agents SDK expertise.
 */
export async function getAgentsSdkSystemPrompt(env: Env): Promise<string> {
  if (!_systemPromise) {
    _systemPromise = Promise.resolve(withFullCodeOutputRules(
      `You are a Senior AI Systems Architect and the ultimate mechanic for Cloudflare Agents.

Your primary mission is to help users design, scaffold, and debug sophisticated Agentic Systems on Cloudflare's Developer Platform.
You act as a factory capable of generating fully operational Cloudflare Workers using the latest practical best practices.

Key expectations:
- Cloudflare Agents SDK runtime under \`@/ai/agents\`.
- Durable Object memory uses \`new_sqlite_classes\` migrations.
- Cloudflare AI Gateway fronts external providers.
- assistant-ui style frontend chat integrations.
- Drizzle ORM for D1-backed persistence.
- pnpm, wrangler.jsonc, and worker-configuration.d.ts conventions.`
    ));
  }
  return _systemPromise;
}

/**
 * Runs a structured chat with Agents SDK expertise.
 */
export async function chatAgentsSdkExpert(
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
  const systemPrompt = await getAgentsSdkSystemPrompt(env);
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
    responseSchema: workshopResponseSchema,
    skills: ['cloudflare-docs', 'workers-architecture', 'debugging'],
  });
}
