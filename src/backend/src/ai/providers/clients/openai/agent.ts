/**
 * @file ai/providers/clients/openai/agent.ts
 * @description OpenAI-compat agent execution layer routed through Cloudflare AI Gateway.
 *
 * Replaces the deprecated `@/ai/agents/runtime/openai` module.
 *
 * Design:
 *  - `Agent` is a lightweight config holder (name, model, instructions, outputType).
 *  - `run()` uses the Vercel AI SDK `generateObject()` with an OpenAI-compat client
 *    pointed at the AI Gateway `/compat` base URL for the resolved provider.
 *  - Provider + model are first-class params — no hard-coded provider-specific logic.
 *  - Workers AI model strings (e.g. `@cf/meta/llama-3.3-70b`) pass through
 *    `getCompatModelName()` before being sent to the gateway so the compat endpoint
 *    receives the correct `workers-ai/<model>` slug.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AIGateway } from '@/ai/providers/ai-gateway';
import {
  SupportedProvider,
  normalizeProvider,
  getCompatModelName,
} from '@/ai/providers/ai-gateway/config';
import { Logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentOptions {
  name: string;
  model: string;
  instructions: string;
  outputType: z.ZodType<any>;
  env: Env;
  /** Override the provider. Defaults to the model prefix or env AI_DEFAULT_PROVIDER. */
  provider?: SupportedProvider | string;
}

// ── Agent class ───────────────────────────────────────────────────────────────

/**
 * Lightweight config holder. Kept as a class so call sites that do `new Agent({...})`
 * continue to work without changes.
 */
export class Agent {
  constructor(public options: AgentOptions) {}
}

// ── Internal: resolve provider from model string or explicit override ─────────

/**
 * Infer provider from the model slug when no explicit provider is given.
 *
 * Heuristics:
 *  - `@cf/…`           → workers-ai (Workers AI via AI Gateway compat)
 *  - `workers-ai/…`    → workers-ai
 *  - `gpt-…`           → openai
 *  - `claude-…`        → anthropic
 *  - `gemini-…`        → gemini
 *  - anything else     → falls back to env AI_DEFAULT_PROVIDER
 */
function inferProviderFromModel(model: string): SupportedProvider | undefined {
  if (model.startsWith('@cf/') || model.startsWith('workers-ai/')) return 'worker-ai';
  if (model.startsWith('gpt-') || model.startsWith('openai/')) return 'openai';
  if (model.startsWith('claude-') || model.startsWith('anthropic/')) return 'anthropic';
  if (model.startsWith('gemini-') || model.startsWith('google-')) return 'gemini';
  return undefined;
}

// ── run() — gateway-routed structured generation ──────────────────────────────

/**
 * Executes an `Agent` against its model via the AI Gateway OpenAI-compat endpoint.
 *
 * Resolution order for provider:
 *  1. `agent.options.provider` (explicit override)
 *  2. Inferred from model string prefix
 *  3. `env.AI_DEFAULT_PROVIDER`
 *  4. `'worker-ai'` (global fallback)
 *
 * @param agent  - Configured Agent instance
 * @param prompt - User-facing prompt to generate against
 * @returns `{ finalOutput }` — the structured object matching `outputType`
 */
export async function run(
  agent: Agent,
  prompt: string,
): Promise<{ finalOutput: any }> {
  const { env, name, model, instructions, outputType, provider: explicitProvider } = agent.options;
  const logger = new Logger(env, `Agent:${name}`);

  // 1. Resolve provider
  const resolvedProvider = normalizeProvider(
    explicitProvider ||
    inferProviderFromModel(model) ||
    (env as any).AI_DEFAULT_PROVIDER,
  );

  // 2. Normalize model slug for AI Gateway compat endpoint
  const gatewayModel = getCompatModelName(model);

  logger.info(
    `[run] provider=${resolvedProvider} model=${model} → gateway slug=${gatewayModel}`,
  );

  // 3. Build AI Gateway base URL (openai_compatible = true → /compat path)
  const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, {
    provider: resolvedProvider,
    endpoint: 'chat',
    openai_compatible: true,
  });

  // 4. Create Vercel AI SDK-compatible OpenAI client pointed at the gateway
  const gatewayClient = createOpenAI({
    baseURL: AIGateway.formatBaseUrlForClient(baseUrl, 'openai_sdk'),
    apiKey: apiKey || 'dummy-key-for-gateway',
    headers: aigToken
      ? { 'cf-aig-authorization': `Bearer ${aigToken}` }
      : undefined,
  });

  // 5. Generate structured output
  try {
    const result = await generateObject({
      model: gatewayClient(gatewayModel),
      system: instructions,
      prompt,
      schema: outputType,
    });

    logger.info(`[run] Generation complete for ${name}`);
    return { finalOutput: result.object };
  } catch (err: any) {
    logger.error(`[run] Failed for ${name}: ${err.message}`);
    throw err;
  }
}

// ── Higher-level helper: setup + create OpenAI Agents SDK agent ───────────────
// Kept for callers that need the @openai/agents SDK Agent object directly.

export { setupOpenAIAgentClient, createOpenAIAgent } from './agent-sdk-helpers';
