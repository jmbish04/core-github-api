/**
 * AI Provider Configuration & Resolution Module
 * 
 * This module manages the selection and configuration of AI models and providers.
 * It provides utilities to normalize provider names, resolve environment-based
 * defaults, and create standardized runners for AI agents.
 * 
 * @module AI/Config
 */



/**
 * Union of supported AI provider identifiers.
 * - worker-ai: Cloudflare Workers AI (Default)
 * - openai: Native OpenAI models
 * - gemini: Google DeepMind Gemini models
 * - anthropic: Anthropic Claude models
 */
export type SupportedProvider =
  | "worker-ai"
  | "workers-ai"
  | "openai"
  | "gemini"
  | "google-ai-studio"
  | "anthropic";

/** Default provider when none is specified. */
export const DEFAULT_AI_PROVIDER: SupportedProvider = "worker-ai";
/** Default model for Cloudflare Workers AI. llama-3.3-70b is preferred for reasoning. */
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";



/**
 * Normalizes a string into a SupportedProvider type.
 * @param provider - Raw provider name string.
 * @returns A validated SupportedProvider or the default.
 */
function normalizeProvider(provider?: string): SupportedProvider {
  if (!provider) {
    return DEFAULT_AI_PROVIDER;
  }

  const normalized = provider.toLowerCase().trim();
  if (normalized === "worker-ai" || normalized === "workers-ai") {
    return "worker-ai";
  }
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "gemini" || normalized === "google" || normalized === "google-ai-studio") {
    return "gemini";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }

  return DEFAULT_AI_PROVIDER;
}

/**
 * Resolves the default AI provider from environment variables.
 * Checks `AI_DEFAULT_PROVIDER` or `AI_PROVIDER`.
 * 
 * @param env - The Cloudflare Environment bindings.
 * @returns The resolved provider identifier.
 * @agent-note Use this to ensure consistent provider usage across different execution contexts.
 */
export function resolveDefaultAiProvider(env: Env): SupportedProvider {
  const configured =
    env.AI_DEFAULT_PROVIDER ||
    (env as unknown as Record<string, unknown>).AI_PROVIDER as string;
  return normalizeProvider(configured);
}

/**
 * Resolves the default AI model for a given provider or environment.
 * prioritizes `AI_DEFAULT_MODEL` or `WORKERS_AI_MODEL` environment variables.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param provider - Optional provider to resolve for.
 * @returns The model string identifier.
 */
export function resolveDefaultAiModel(env: Env, provider?: SupportedProvider): string {
  const model =
    env.AI_DEFAULT_MODEL ||
    (env as unknown as Record<string, unknown>).WORKERS_AI_MODEL as string;
  if (model && model.trim()) {
    return model.trim();
  }

  const effectiveProvider = provider || resolveDefaultAiProvider(env);
  if (effectiveProvider === "worker-ai" || effectiveProvider === "workers-ai") {
    return DEFAULT_WORKERS_AI_MODEL;
  }

  // Keep a stable default even for other providers unless explicitly overridden.
  return DEFAULT_WORKERS_AI_MODEL;
}

export async function resolveGatewayApiKey(env: Env): Promise<string> {
  const apiKeyToken = env.AI_GATEWAY_TOKEN as unknown;
  const apiKey = typeof apiKeyToken === 'string' ? apiKeyToken : await (apiKeyToken as { get?: () => Promise<string> })?.get?.();
  if (!apiKey) {
    throw new Error("AI_GATEWAY_TOKEN is required for AI SDK calls.");
  }
  return apiKey;
}


