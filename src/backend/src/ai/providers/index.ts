/**
 * AI Provider Registry & Unified Interface
 * 
 * This module serves as the primary router for all AI provider integrations.
 * It defines unified types for options, responses, and model capabilities,
 * and handles automatic provider-to-provider fallback logic.
 * 
 * @module AI/Providers
 */
import { 
  resolveDefaultAiProvider,
  resolveDefaultAiModel,
  normalizeProvider,
  SupportedProvider 
} from "./ai-gateway/config";
import * as openai from "./openai";
import * as gemini from "./gemini";
import * as anthropic from "./anthropic";
import * as workerAi from "./worker-ai";
import * as jules from "./jules";
import { Logger } from "@/lib/logger";
import { z } from "zod";

/**
 * metadata for an AI provider fallback event.
 */
export interface FallbackAlert {
  fallbackUsed: boolean;
  originalProvider: string;
  errorMessage: string;
}

/**
 * configuration options for AI generation requests.
 */
export interface AIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  sanitize?: boolean;
  effort?: "low" | "medium" | "high";
  onFallback?: (alert: FallbackAlert) => void;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface TextWithToolsResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface StructuredWithToolsResponse<T> {
  data: T;
  toolCalls: ToolCall[];
}

export interface FileInput {
  name: string;
  type: string;
  data: string;
  isBase64: boolean;
}

export type ModelCapability = 
  | 'structured_response' 
  | 'high_reasoning' 
  | 'fast' 
  | 'vision' 
  | 'function_calling';

/**
 * Unified model definition string across all providers.
 */
export interface UnifiedModel {
  /** Unique API ID (e.g., "gpt-4o") */
  id: string;
  /** Provider key: 'google' | 'openai' | 'anthropic' | 'cloudflare' | 'jules' */
  provider: string;
  /** Human-friendly name */
  name: string;
  description: string;
  capabilities: ModelCapability[];
  /** Context window or output limit */
  maxTokens?: number;
  /** Original response for debugging */
  raw: any;
}

export type ModelFilter = ModelCapability;

/**
 * Core Routing Functions
 */

export async function verifyApiKey(env: Env, providerOverride?: SupportedProvider | 'jules'): Promise<boolean> {
  const provider = providerOverride || resolveDefaultAiProvider(env);
  const logger = new Logger(env, 'AIRouter');
  logger.info(`verifyApiKey`, { provider });
  await logger.flush();
  switch (provider) {
    case 'openai': return openai.verifyApiKey(env);
    case 'gemini': return gemini.verifyApiKey(env);
    case 'anthropic': return anthropic.verifyApiKey(env);
    case 'jules': return jules.verifyApiKey(env);
    default: return workerAi.verifyApiKey(env);
  }
}

export function resolveInvocation(
  env: Env,
  providerOverride?: string,
  modelOverride?: string
): { provider: SupportedProvider | 'jules'; model?: string } {
  if (!providerOverride && !modelOverride) {
    const provider = resolveDefaultAiProvider(env);
    return { provider, model: resolveDefaultAiModel(env, provider as any) };
  }
  if (providerOverride && !modelOverride) {
    const prov = providerOverride === 'jules' ? 'jules' : normalizeProvider(providerOverride);
    return { 
      provider: prov, 
      model: prov === 'jules' ? undefined : resolveDefaultAiModel(env, prov as any) 
    };
  }
  if (!providerOverride && modelOverride) {
    return { provider: 'worker-ai', model: modelOverride };
  }
  return { 
    provider: providerOverride === 'jules' ? 'jules' : normalizeProvider(providerOverride!), 
    model: modelOverride 
  };
}

/**
 * Universal text generation function with automatic fallback.
 * Routes to the appropriate provider and retries with Workers AI on failure.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param prompt - User input.
 * @param systemPrompt - Optional role/instructions.
 * @param options - Generation settings.
 * @param providerOverride - Force a specific provider.
 */
export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<string> {
  const { provider, model } = resolveInvocation(env, providerOverride, options?.model);
  const finalOptions = { ...options, model };
  const logger = new Logger(env, 'AIRouter');
  logger.info(`generateText`, { provider, model });
  await logger.flush();
  
  try {
    switch (provider) {
      case 'openai': return await openai.generateText(env, prompt, systemPrompt, finalOptions);
      case 'gemini': return await gemini.generateText(env, prompt, systemPrompt, finalOptions);
      case 'anthropic': return await anthropic.generateText(env, prompt, systemPrompt, finalOptions);
      case 'jules': return await jules.generateText(env, prompt, systemPrompt, finalOptions);
      case 'worker-ai': return await workerAi.generateText(env, prompt, systemPrompt, finalOptions);
      default: return await workerAi.generateText(env, prompt, systemPrompt, finalOptions);
    }
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = { fallbackUsed: true, originalProvider: provider, errorMessage: error.message || String(error) };
      console.warn(`[AI_FALLBACK] ${provider} failed during generateText. Routing to worker-ai.`, alert);
      if (options?.onFallback) options.onFallback(alert);
      return await workerAi.generateText(env, prompt, systemPrompt, finalOptions);
    }
    throw error;
  }
}

export async function generateStructuredResponse<T>(
  env: Env,
  prompt: string,
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<T> {
  const { provider, model } = resolveInvocation(env, providerOverride, options?.model);
  const finalOptions = { ...options, model };
  
  try {
    switch (provider) {
      case 'openai': return await openai.generateStructuredResponse<T>(env, prompt, schema as any, systemPrompt, finalOptions);
      case 'gemini': return await gemini.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, finalOptions);
      case 'anthropic': return await anthropic.generateStructuredResponse<T>(env, prompt, schema as any, systemPrompt, finalOptions);
      case 'jules': return await jules.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, finalOptions);
      case 'worker-ai': return await workerAi.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, finalOptions);
      default: return await workerAi.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, finalOptions);
    }
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = { fallbackUsed: true, originalProvider: provider, errorMessage: error.message || String(error) };
      console.warn(`[AI_FALLBACK] ${provider} failed during generateStructuredResponse. Routing to worker-ai.`, alert);
      if (options?.onFallback) options.onFallback(alert);
      return await workerAi.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, finalOptions);
    }
    throw error;
  }
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<TextWithToolsResponse> {
  const { provider, model } = resolveInvocation(env, providerOverride, options?.model);
  const finalOptions = { ...options, model };
  
  try {
    switch (provider) {
      case 'openai': return await openai.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
      case 'gemini': return await gemini.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
      case 'anthropic': return await anthropic.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
      case 'jules': return await jules.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
      case 'worker-ai': return await workerAi.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
      default: return await workerAi.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
    }
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = { fallbackUsed: true, originalProvider: provider, errorMessage: error.message || String(error) };
      console.warn(`[AI_FALLBACK] ${provider} failed during generateTextWithTools. Routing to worker-ai.`, alert);
      if (options?.onFallback) options.onFallback(alert);
      return await workerAi.generateTextWithTools(env, prompt, tools, systemPrompt, finalOptions);
    }
    throw error;
  }
}

export async function generateStructuredWithTools<T>(
  env: Env,
  prompt: string,
  schema: z.ZodType<T>,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<StructuredWithToolsResponse<T>> {
  const { provider, model } = resolveInvocation(env, providerOverride, options?.model);
  const finalOptions = { ...options, model };
  
  try {
    switch (provider) {
      case 'openai': return await openai.generateStructuredWithTools<T>(env, prompt, schema as any, tools, systemPrompt, finalOptions);
      case 'gemini': return await gemini.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, finalOptions);
      case 'anthropic': return await anthropic.generateStructuredWithTools<T>(env, prompt, schema as any, tools, systemPrompt, finalOptions);
      case 'jules': return await jules.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, finalOptions);
      case 'worker-ai': return await workerAi.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, finalOptions);
      default: return await workerAi.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, finalOptions);
    }
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = { fallbackUsed: true, originalProvider: provider, errorMessage: error.message || String(error) };
      console.warn(`[AI_FALLBACK] ${provider} failed during generateStructuredWithTools. Routing to worker-ai.`, alert);
      if (options?.onFallback) options.onFallback(alert);
      return await workerAi.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, finalOptions);
    }
    throw error;
  }
}

export async function generateTextFromFiles(
  env: Env,
  prompt: string,
  files: FileInput[],
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider | 'jules'
): Promise<string> {
  // Default to 'gemini' for file/multimodal operations (best multimodal support)
  const { provider, model } = resolveInvocation(env, providerOverride || 'gemini', options?.model);
  const finalOptions = { ...options, model };
  try {
    switch (provider) {
      case 'gemini': return await gemini.generateTextFromFiles(env, prompt, files, systemPrompt, finalOptions);
      case 'jules': return await jules.generateTextFromFiles(env, prompt, files, systemPrompt, finalOptions);
      case 'worker-ai': return await workerAi.generateTextFromFiles(env, prompt, files, systemPrompt, finalOptions);
      default: return await gemini.generateTextFromFiles(env, prompt, files, systemPrompt, finalOptions);
    }
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = { fallbackUsed: true, originalProvider: provider, errorMessage: error.message || String(error) };
      console.warn(`[AI_FALLBACK] ${provider} failed during generateTextFromFiles. Routing to worker-ai.`, alert);
      if (options?.onFallback) options.onFallback(alert);
      return await workerAi.generateTextFromFiles(env, prompt, files, systemPrompt, finalOptions);
    }
    throw error;
  }
}

export async function generateStructuredResponseFromFiles<T>(
  env: Env,
  prompt: string,
  files: FileInput[],
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<T> {
  // Default to 'gemini' for file/multimodal operations (best multimodal support)
  const { provider, model } = resolveInvocation(env, providerOverride || 'gemini', options?.model);
  const finalOptions = { ...options, model };
  try {
    switch (provider) {
      case 'gemini': return await gemini.generateStructuredResponseFromFiles<T>(env, prompt, files, schema, systemPrompt, finalOptions);
      case 'jules': return await jules.generateStructuredResponseFromFiles<T>(env, prompt, files, schema, systemPrompt, finalOptions);
      case 'worker-ai': return await workerAi.generateStructuredResponseFromFiles<T>(env, prompt, files, schema, systemPrompt, finalOptions);
      default: return await gemini.generateStructuredResponseFromFiles<T>(env, prompt, files, schema, systemPrompt, finalOptions);
    }
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = { fallbackUsed: true, originalProvider: provider, errorMessage: error.message || String(error) };
      console.warn(`[AI_FALLBACK] ${provider} failed during generateStructuredResponseFromFiles. Routing to worker-ai.`, alert);
      if (options?.onFallback) options.onFallback(alert);
      return await workerAi.generateStructuredResponseFromFiles<T>(env, prompt, files, schema, systemPrompt, finalOptions);
    }
    throw error;
  }
}

export async function generateEmbedding(
  env: Env,
  text: string
): Promise<number[]> {
  return workerAi.generateEmbedding(env, text);
}

/**
 * Generates embeddings (plural) using the default embedding model.
 */
export async function generateEmbeddings(
  env: Env,
  text: string | string[]
): Promise<number[][]> {
  return workerAi.generateEmbeddings(env, text);
}

/**
 * Universal MCP & Context Helper Methods
 */

export async function rewriteQuestionForMCP(
  env: Env,
  question: string,
  context?: {
    bindings?: string[];
    libraries?: string[];
    tags?: string[];
    codeSnippets?: Array<{ file_path: string; code: string; relation: string }>;
  },
  options?: AIOptions
): Promise<string> {
  const systemPrompt = "You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and optimized for querying Cloudflare documentation.";
  let prompt = `Original Question: ${question}\n\n`;

  if (context) {
    if (context.bindings?.length) prompt += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length) prompt += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length) prompt += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      // Pass full code context to Jules (1-2 million token context window)
      prompt += `\nCode Context:\n${context.codeSnippets.map(s => `File: ${s.file_path} (${s.relation})\n${s.code}`).join("\n\n")}`;
    }
  }

  const schema = z.object({
    rewritten_question: z.string().describe("The technical, search-optimized question.")
  });

  // Use Jules provider directly for repoless massive-context session
  const result = await jules.generateStructuredResponse<{ rewritten_question: string }>(env, prompt, schema, systemPrompt, options);
  return result.rewritten_question;
}

export async function analyzeResponseAndGenerateFollowUps(
  env: Env,
  originalQuestion: string,
  mcpResponse: any,
  options?: AIOptions
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = "You are a technical documentation analyst. Analyze responses from documentation and identify gaps.";
  const prompt = `Original Question: ${originalQuestion}\n\nDocumentation Response: ${JSON.stringify(mcpResponse, null, 2)}`;

  const schema = z.object({
    analysis: z.string().describe("Analysis of whether the response answers the question."),
    followUpQuestions: z.array(z.string()).describe("2-3 specific follow-up questions.")
  });

  return await generateStructuredResponse<{ analysis: string; followUpQuestions: string[] }>(env, prompt, schema, systemPrompt, options);
}

/**
 * Aggregates available models from all active providers.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param provider - Optional specific provider to fetch models for.
 * @param filter - Optional capability to filter models.
 * @returns Combined list of unified model definitions.
 */
export async function getModels(
  env: Env,
  provider?: SupportedProvider | 'google' | 'cloudflare',
  filter?: ModelFilter
): Promise<UnifiedModel[]> {
  const allModels: UnifiedModel[] = [];

  // Map 'google' to 'gemini' and 'cloudflare' to 'worker-ai' if needed, or simply handle all aliases
  const fetchProviders = provider ? [provider] : ["gemini", "openai", "anthropic", "worker-ai"] as SupportedProvider[];

  const promises = fetchProviders.map(async (p) => {
    try {
      switch (p) {
        case 'google':
        case 'gemini': return await gemini.getGoogleModels(env, filter);
        case 'openai': return await openai.getOpenAIModels(env, filter);
        case 'anthropic': return await anthropic.getAnthropicModels(env, filter);
        case 'cloudflare':
        case 'worker-ai': return await workerAi.getCloudflareModels(env, filter);
        default: return [];
      }
    } catch (e) {
      console.warn(`[getModels] failed to fetch from ${p}:`, e);
      return [];
    }
  });

  const results = await Promise.all(promises);
  results.forEach(res => allModels.push(...res));

  return allModels;
}

/**
 * Jules SDK Specific Orchestration Methods
 */
export async function analyzeRepo(env: Env, repoUrl: string, prompt: string): Promise<string> {
    return await jules.analyzeRepo(env, repoUrl, prompt);
}

export async function completeTask(env: Env, repoUrl: string, issueId: string): Promise<string> {
    return await jules.completeTask(env, repoUrl, issueId);
}

export async function createPlan(env: Env, prompt: string): Promise<string> {
    return await jules.createPlan(env, prompt);
}

/**
 * Universal OpenAI SDK Helper Methods (via AI Gateway Compat Mode)
 */

export { 
  getJulesClient 
} from './jules';
import { 
  createOpenAIChatClient, 
  createOpenAIAgent, 
  setupOpenAIAgentClient, 
  OpenAIAgentOptions 
} from './clients';
export { 
  createOpenAIChatClient, 
  createOpenAIAgent, 
  setupOpenAIAgentClient, 
  type OpenAIAgentOptions 
};

/**
 * Runs a text prompt using the native OpenAI Chat SDK via AI Gateway compat mode.
 */
export async function runWithOpenAIChat(
  env: Env,
  prompt: string,
  instructions: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider | 'cloudflare' | 'google'
): Promise<string> {
  const invocation = resolveInvocation(env, providerOverride, options?.model);
  const client = await createOpenAIChatClient(env, invocation.provider as SupportedProvider);
  let model = invocation.model!;
  
  if (invocation.provider !== 'worker-ai' && invocation.provider !== 'jules' && !model.includes('/')) {
     const prefix = invocation.provider === 'gemini' ? 'google-ai-studio' : invocation.provider;
     model = `${prefix}/${model}`;
  }

  const response = await client.chat.completions.create({
    model: model || resolveDefaultAiModel(env, 'worker-ai'),
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: prompt }
    ]
  });

  return response.choices?.[0]?.message?.content || '';
}

/**
 * Runs a task using the native @openai/agents SDK via AI Gateway compat mode.
 */
export async function runWithOpenAIAgent(
  env: Env,
  prompt: string,
  agentOptions: OpenAIAgentOptions,
  options?: AIOptions,
  providerOverride?: SupportedProvider | 'cloudflare' | 'google'
): Promise<any> {
  const invocation = resolveInvocation(env, providerOverride, options?.model);
  let model = invocation.model!;
  
  if (invocation.provider !== 'worker-ai' && invocation.provider !== 'jules' && !model.includes('/')) {
     const prefix = invocation.provider === 'gemini' ? 'google-ai-studio' : invocation.provider;
     model = `${prefix}/${model}`;
  }

  const agentOpts = {
    ...agentOptions,
    model: model || resolveDefaultAiModel(env, 'worker-ai')
  };

  const agent = await createOpenAIAgent(env, invocation.provider as SupportedProvider, agentOpts);
  
  const { run } = await import('@openai/agents');
  const result = await run(agent, prompt);
  
  return result.finalOutput;
}