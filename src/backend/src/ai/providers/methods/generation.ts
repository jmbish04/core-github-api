/**
 * AI Generation Method Implementations
 *
 * Contains the core inference logic delegated from the thin AIProvider class.
 * Each function receives the AIProvider instance for access to env, logger,
 * and resolution utilities.
 *
 * @module AI/Providers/Methods/Generation
 */
import type { AIProvider } from '../index';
import type {
  AIOptions,
  FallbackAlert,
  TextWithToolsResponse,
  StructuredWithToolsResponse,
  FileInput,
} from '../types';
import { resolveDefaultAiModel } from '../ai-gateway/config';
import * as openai from '../vendors/openai';
import * as gemini from '../vendors/gemini';
import * as anthropic from '../vendors/anthropic';
import * as workerAi from '../vendors/worker-ai';
import * as jules from '../vendors/jules';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dispatch<R>(
  provider: string,
  fn: (mod: any) => Promise<R>,
): Promise<R> {
  switch (provider) {
    case 'openai': return fn(openai);
    case 'gemini': return fn(gemini);
    case 'anthropic': return fn(anthropic);
    case 'jules': return fn(jules);
    default: return fn(workerAi);
  }
}

async function withFallback<R>(
  provider: string,
  primary: () => Promise<R>,
  fallback: () => Promise<R>,
  options?: AIOptions,
): Promise<R> {
  try {
    return await primary();
  } catch (error: any) {
    if (provider !== 'worker-ai') {
      const alert: FallbackAlert = {
        fallbackUsed: true,
        originalProvider: provider,
        errorMessage: error.message || String(error),
      };
      console.warn(`[AI_FALLBACK] ${provider} failed. Routing to worker-ai.`, alert);
      options?.onFallback?.(alert);
      return fallback();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Generation implementations
// ---------------------------------------------------------------------------

async function resolveSystemPrompt(ai: AIProvider, systemPrompt?: string, options?: any): Promise<string | undefined> {
  let context = options?.skillContext;
  if (!context && options?.skills) {
    context = await ai.skills.getSkillInstructions(options.skills);
  }
  if (!context) return systemPrompt;
  return systemPrompt ? `${systemPrompt}\n${context}` : context;
}

/**
 * REQUIREMENT 1: generateTextImpl Integration (Jules Native Promise)
 * 
 * Optimized for heavy-lifting sessions using the Jules SDK with repoless
 * execution and native promise resolution.
 */
export async function generateTextImpl(
  ai: AIProvider,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions,
): Promise<string> {
  const finalSystemPrompt = await resolveSystemPrompt(ai, systemPrompt, options);
  const { provider, model } = ai.resolveInvocation('text', options?.provider, options?.model);
  const opts = { ...options, model };

  if (provider === 'jules') {
    const logger = new Logger(ai.env, 'AIProvider:Generation');
    try {
      // 1. Get client
      const client = await jules.getJulesClient(ai.env);
      
      // 3. Concatenate systemPrompt and prompt
      const sessionPrompt = finalSystemPrompt 
        ? `${finalSystemPrompt}\n\n${prompt}` 
        : `${prompt}`;
      
      // 4. Start repoless session
      const session = await client.session({
        prompt: sessionPrompt,
        repoless: true,
        requireApproval: false,
        autoPr: false,
      });

      // 5. Execution: Native promise resolution
      const outcome = await session.result();
      
      // 6. Return final text with summary extraction and fallback
      let textContent = outcome?.summary?.[0]?.content;
      if (!textContent && typeof outcome?.generatedFiles === 'function') {
        const files = outcome.generatedFiles().all();
        textContent = files.map((f: any) => f.content || '').join('\n\n');
      }

      return textContent || "";

    } catch (e) {
      logger.error('Jules generateText error', e);
      const alert: FallbackAlert = {
        fallbackUsed: true,
        originalProvider: provider,
        errorMessage: (e as any).message || String(e),
      };
      console.warn(`[AI_FALLBACK] ${provider} failed. Routing to worker-ai.`, alert);
      options?.onFallback?.(alert);
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'text');
      return workerAi.generateText(ai.env, prompt, finalSystemPrompt, { ...options, model: fbModel });
    }
  }

  return withFallback(
    provider,
    () => dispatch(provider, (mod) => mod.generateText(ai.env, prompt, finalSystemPrompt, opts)),
    () => {
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'text');
      return workerAi.generateText(ai.env, prompt, finalSystemPrompt, { ...options, model: fbModel });
    },
    options,
  );
}

/**
 * REQUIREMENT 2: generateStructuredResponseImpl Integration (Two-Step Process)
 * 
 * Jules is used for high-context ingestion, while Worker AI performs the 
 * final precision extraction to ensure strict Zod schema compliance.
 */
export async function generateStructuredResponseImpl<T>(
  ai: AIProvider,
  prompt: string,
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions,
): Promise<T> {
  const finalSystemPrompt = await resolveSystemPrompt(ai, systemPrompt, options);
  const { provider, model } = ai.resolveInvocation('structured', options?.provider, options?.model);
  const opts = { ...options, model };

  if (provider === 'jules') {
    const logger = new Logger(ai.env, 'AIProvider:Generation');
    try {
      // Step 1: Jules Heavy Lifting
      const client = await jules.getJulesClient(ai.env);
      
      // Convert Zod schema to JSON Schema string
      let jsonSchemaStr = "";
      try {
        jsonSchemaStr = JSON.stringify(zodToJsonSchema(schema as any));
      } catch (err) {
        logger.error('[AIProvider:Generation] Failed to convert Zod schema to JSON Schema', err);
        jsonSchemaStr = "the requested JSON schema structure";
      }

      const instructions = `Respond to the following prompt. 
      Your final output MUST contain data that satisfies the requested JSON schema structure. 
      Ensure all data points are present. 
      Requested Schema: ${jsonSchemaStr}
      `;
      
      const sessionPrompt = finalSystemPrompt 
        ? `${finalSystemPrompt}\n\n${prompt}\n\n${instructions}` 
        : `${prompt}\n\n${instructions}`;
      
      const promptWithDirective = sessionPrompt;
      
      const session = await client.session({
        prompt: promptWithDirective,
        repoless: true,
        requireApproval: false,
        autoPr: false,
      });

      const outcome = await session.result();
      
      let rawText = outcome?.summary?.[0]?.content;
      if (!rawText && typeof outcome?.generatedFiles === 'function') {
        const files = outcome.generatedFiles().all();
        rawText = files.map((f: any) => f.content || '').join('\n\n');
      }
      
      const julesOutput = rawText || "";
      
      // Step 2: Worker AI Extraction (Recursive call)
      const { STRUCTURING_MODEL } = await import('../index');
      const extractionPrompt = `Extract the data from the following text and conform it strictly to the requested Zod schema.\n\nText:\n${julesOutput}`;
      
      return await ai.generateStructuredResponse<T>(
        extractionPrompt,
        schema,
        "You are a strict data extraction assistant. Map the provided text accurately to the JSON schema.",
        { 
          ...options, 
          provider: 'worker-ai', 
          model: STRUCTURING_MODEL 
        }
      );

    } catch (e) {
      logger.error('Jules generateStructuredResponse error', e);
      const alert: FallbackAlert = {
        fallbackUsed: true,
        originalProvider: provider,
        errorMessage: (e as any).message || String(e),
      };
      console.warn(`[AI_FALLBACK] ${provider} failed. Routing to worker-ai.`, alert);
      options?.onFallback?.(alert);
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'structured');
      return workerAi.generateStructuredResponse<T>(ai.env, prompt, schema, finalSystemPrompt, { ...options, model: fbModel });
    }
  }

  return withFallback(
    provider,
    () => dispatch(provider, (mod) => mod.generateStructuredResponse(ai.env, prompt, schema as any, finalSystemPrompt, opts)),
    () => {
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'structured');
      return workerAi.generateStructuredResponse<T>(ai.env, prompt, schema, finalSystemPrompt, { ...options, model: fbModel });
    },
    options,
  );
}

export async function generateTextWithToolsImpl(
  ai: AIProvider,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions,
): Promise<TextWithToolsResponse> {
  const finalSystemPrompt = await resolveSystemPrompt(ai, systemPrompt, options);
  const { provider, model } = ai.resolveInvocation('functions', options?.provider, options?.model);
  const opts = { ...options, model };

  return withFallback(
    provider,
    () => dispatch(provider, (mod) => mod.generateTextWithTools(ai.env, prompt, tools, finalSystemPrompt, opts)),
    () => {
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'functions');
      return workerAi.generateTextWithTools(ai.env, prompt, tools, finalSystemPrompt, { ...options, model: fbModel });
    },
    options,
  );
}

export async function generateStructuredWithToolsImpl<T>(
  ai: AIProvider,
  prompt: string,
  schema: z.ZodType<T>,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions,
): Promise<StructuredWithToolsResponse<T>> {
  const finalSystemPrompt = await resolveSystemPrompt(ai, systemPrompt, options);
  const { provider, model } = ai.resolveInvocation('functions', options?.provider, options?.model);
  const opts = { ...options, model };

  return withFallback(
    provider,
    () => dispatch(provider, (mod) => mod.generateStructuredWithTools(ai.env, prompt, schema as any, tools, finalSystemPrompt, opts)),
    () => {
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'functions');
      return workerAi.generateStructuredWithTools<T>(ai.env, prompt, schema, tools, finalSystemPrompt, { ...options, model: fbModel });
    },
    options,
  );
}

export async function generateTextFromFilesImpl(
  ai: AIProvider,
  prompt: string,
  files: FileInput[],
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: string,
): Promise<string> {
  const finalSystemPrompt = await resolveSystemPrompt(ai, systemPrompt, options);
  const { provider, model } = ai.resolveInvocation('vision', options?.provider || providerOverride || 'gemini', options?.model);
  const opts = { ...options, model };

  return withFallback(
    provider,
    () => dispatch(provider, (mod) => mod.generateTextFromFiles(ai.env, prompt, files, finalSystemPrompt, opts)),
    () => {
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'vision');
      return workerAi.generateTextFromFiles(ai.env, prompt, files, finalSystemPrompt, { ...options, model: fbModel });
    },
    options,
  );
}

export async function generateStructuredResponseFromFilesImpl<T>(
  ai: AIProvider,
  prompt: string,
  files: FileInput[],
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions,
): Promise<T> {
  const finalSystemPrompt = await resolveSystemPrompt(ai, systemPrompt, options);
  const { provider, model } = ai.resolveInvocation('vision', options?.provider || 'gemini', options?.model);
  const opts = { ...options, model };

  return withFallback(
    provider,
    () => dispatch(provider, (mod) => mod.generateStructuredResponseFromFiles(ai.env, prompt, files, schema as any, finalSystemPrompt, opts)),
    () => {
      const fbModel = resolveDefaultAiModel(ai.env, 'worker-ai', 'vision');
      return workerAi.generateStructuredResponseFromFiles<T>(ai.env, prompt, files, schema, finalSystemPrompt, { ...options, model: fbModel });
    },
    options,
  );
}

export async function generateEmbeddingImpl(
  ai: AIProvider,
  text: string,
): Promise<number[]> {
  return workerAi.generateEmbedding(ai.env, text);
}

export async function generateEmbeddingsImpl(
  ai: AIProvider,
  text: string | string[],
): Promise<number[][]> {
  return workerAi.generateEmbeddings(ai.env, text);
}
