/**
 * AI Provider Configuration & Resolution Module
 * 
 * This module manages the selection and configuration of AI models and providers.
 * It provides utilities to normalize provider names, resolve environment-based
 * defaults, and create standardized runners for AI agents.
 * 
 * @module AI/Config
 */

import { Agent, OpenAIProvider, Runner, type ModelProvider } from "@openai/agents";
import { getAiGatewayUrlForOpenAI } from "@/ai/utils/ai-gateway";

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

const PROVIDER_TO_GATEWAY: Record<SupportedProvider, string> = {
  "worker-ai": "workers-ai",
  "workers-ai": "workers-ai",
  openai: "openai",
  gemini: "google-ai-studio",
  "google-ai-studio": "google-ai-studio",
  anthropic: "anthropic",
};

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
export function resolveDefaultAiProvider(env: Partial<Env>): SupportedProvider {
  const configured =
    (env as Partial<Env> & { AI_DEFAULT_PROVIDER?: string; AI_PROVIDER?: string }).AI_DEFAULT_PROVIDER ||
    (env as Partial<Env> & { AI_DEFAULT_PROVIDER?: string; AI_PROVIDER?: string }).AI_PROVIDER;
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
export function resolveDefaultAiModel(env: Partial<Env>, provider?: SupportedProvider): string {
  const model =
    (env as Partial<Env> & { AI_DEFAULT_MODEL?: string; WORKERS_AI_MODEL?: string }).AI_DEFAULT_MODEL ||
    (env as Partial<Env> & { AI_DEFAULT_MODEL?: string; WORKERS_AI_MODEL?: string }).WORKERS_AI_MODEL;
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

async function resolveGatewayApiKey(env: Env): Promise<string> {
  const apiKey = await env.AI_GATEWAY_TOKEN.get();
  if (!apiKey) {
    throw new Error("AI_GATEWAY_TOKEN is required for OpenAI Agents SDK calls.");
  }
  return apiKey;
}

/**
 * Generates the AI Gateway URL for a specific provider.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param provider - Target AI provider.
 * @returns The full URL to the Cloudflare AI Gateway endpoint.
 */
export async function getAiGatewayUrl(
  env: Env,
  provider: SupportedProvider,
): Promise<string> {
  const gatewayProvider = PROVIDER_TO_GATEWAY[provider];
  return getAiGatewayUrlForOpenAI(env, gatewayProvider);
}

export async function getAiBaseUrl(
  env: Env,
  provider: SupportedProvider,
): Promise<string> {
  return getAiGatewayUrlForOpenAI(env, provider);
}

/**
 * Creates a configured Runner instance for the OpenAI Agents SDK.
 * Handles API key resolution, base URL configuration (via Gateway), and model setup.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param provider - Optional provider override.
 * @param model - Optional model override.
 * @returns A promise resolving to a configured Runner.
 * @agent-note This is the primary entry point for low-level Agent SDK interactions.
 */
export async function createRunner(
  env: Env,
  provider?: SupportedProvider,
  model?: string,
): Promise<Runner> {
  const resolvedProvider = provider || resolveDefaultAiProvider(env);
  const resolvedModel = model || resolveDefaultAiModel(env, resolvedProvider);
  const baseURL = await getAiBaseUrl(env, resolvedProvider);
  const apiKey = await resolveGatewayApiKey(env);

  const modelProvider: ModelProvider = new OpenAIProvider({
    apiKey,
    baseURL,
  });

  return new Runner({
    modelProvider,
    model: resolvedModel,
  });
}

/**
 * Executes a text-based agent interaction (non-streaming).
 * 
 * @param options - Configuration for the agent run.
 *  - name: Human-readable name for tracing.
 *  - instructions: System prompt/role for the agent.
 *  - input: User prompt or task.
 * @returns The final text response from the agent.
 */
export async function runTextAgent(options: {
  env: Env;
  provider?: SupportedProvider;
  model?: string;
  name: string;
  instructions: string;
  input: string;
}): Promise<string> {
  const provider = options.provider || resolveDefaultAiProvider(options.env);
  const model = options.model || resolveDefaultAiModel(options.env, provider);
  const runner = await createRunner(options.env, provider, model);
  const agent = new Agent({
    name: options.name,
    instructions: options.instructions,
    model,
  });

  const result = await runner.run(agent, options.input);
  return String(result.finalOutput ?? "");
}

/**
 * Executes a text-based agent interaction with streaming output.
 * 
 * @param options - Configuration for the agent run.
 * @returns A streaming response compatible with the OpenAI Agents SDK.
 * @agent-note Ideal for UI-driven experiences where real-time feedback is required.
 */
export async function streamTextAgent(options: {
  env: Env;
  provider?: SupportedProvider;
  model?: string;
  name: string;
  instructions: string;
  input: string;
}) {
  const provider = options.provider || resolveDefaultAiProvider(options.env);
  const model = options.model || resolveDefaultAiModel(options.env, provider);
  const runner = await createRunner(options.env, provider, model);
  const agent = new Agent({
    name: options.name,
    instructions: options.instructions,
    model,
  });

  return runner.run(agent, options.input, { stream: true });
}
