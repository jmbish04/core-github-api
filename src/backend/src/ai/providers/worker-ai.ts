/**
 * Cloudflare Workers AI Provider Integration
 * 
 * Provides a unified interface to Cloudflare's native Workers AI models, 
 * utilizing the OpenAI SDK compatibility layer through AI Gateway.
 * Supports text generation, structured output, embeddings, and tool calling.
 * 
 * @module AI/Providers/WorkerAI
 */
import { resolveDefaultAiModel } from "./config";
import { cleanJsonOutput, sanitizeAndFormatResponse } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse, ModelCapability, UnifiedModel, ModelFilter, FileInput } from "./index";
import { AIGateway } from "../utils/ai-gateway";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Primary model for reasoning tasks (e.g., Llama 3 or GPT-OSS). */
export const REASONING_MODEL = "@cf/openai/gpt-oss-120b";
/** Primary model for structured output and tool calling tasks. */
export const STRUCTURING_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
/** Primary model for embedding tasks. */
export const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5";

/**
 * Initializes a new client routed through Cloudflare AI Gateway's 
 * universal/compat endpoint for Workers AI using native fetch.
 * 
 * @param env - Cloudflare Environment bindings.
 * @returns A mock OpenAI-like client object interface.
 */
async function getAIClient(env: Env): Promise<any> {
    return AIGateway.createUniversalClient(env, "workers-ai");
}

/**
 * Verifies API connectivity with Workers AI.
 */
export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const client = await getAIClient(env);
    await client.chat.completions.create({
      model: AIGateway.normalizeWorkerAiModel(STRUCTURING_MODEL),
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    });
    return true;
  } catch (error) {
    console.error("Workers AI Verification Error:", error);
    return false;
  }
}

async function executeWithFallback<T>(
  env: Env,
  originalModel: string,
  requiredCapability: ModelFilter | undefined,
  executionFn: (model: string) => Promise<T>
): Promise<T> {
  try {
    return await executionFn(originalModel);
  } catch (error: any) {
    console.warn(`[WorkerAI Fallback] Initial execution failed for model ${originalModel}:`, error?.message);
    const models = await getCloudflareModels(env);
    const requestedModelInfo = models.find(m => m.id === originalModel);
    
    if (requestedModelInfo) {
      if (requiredCapability && !requestedModelInfo.capabilities.includes(requiredCapability)) {
        console.warn(`[WorkerAI Fallback] ALERT: Specified model ${originalModel} is available but lacks capability '${requiredCapability}'.`);
      } else {
        console.warn(`[WorkerAI Fallback] Specified model ${originalModel} is available but failed.`);
      }
    } else {
      console.warn(`[WorkerAI Fallback] Specified model ${originalModel} is NOT available.`);
    }

    const fallbackModelInfo = models.find(m => m.id !== originalModel && (!requiredCapability || m.capabilities.includes(requiredCapability)));
    if (!fallbackModelInfo) {
      console.error(`[WorkerAI Fallback] No alternative model available.`);
      throw error;
    }

    console.warn(`[WorkerAI Fallback] Retrying with alternative model: ${JSON.stringify(fallbackModelInfo)}`);
    return await executionFn(fallbackModelInfo.id);
  }
}

/**
 * Generates text using a Workers AI model.
 */
export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const rawModel = options?.model || resolveDefaultAiModel(env, "worker-ai") || REASONING_MODEL;
  return executeWithFallback(env, rawModel, undefined, async (modelToUse) => {
    const client = await getAIClient(env);
    const model = AIGateway.normalizeWorkerAiModel(modelToUse);

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const isReasoningModel = model.includes("gpt-oss");
    const requestOptions: any = { model, messages };
    if (isReasoningModel && options?.effort) requestOptions.reasoning_effort = options.effort;

    const response = await client.chat.completions.create(requestOptions);
    const textResult = response.choices[0]?.message?.content || "";
    if (options?.sanitize) return sanitizeAndFormatResponse(textResult);
    return textResult;
  });
}

/**
 * Generates a structured response using a Workers AI model.
 */
export async function generateStructuredResponse<T>(
  env: Env,
  prompt: string,
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const rawModel = options?.model || STRUCTURING_MODEL;
  return executeWithFallback(env, rawModel, 'structured_response', async (modelToUse) => {
    const client = await getAIClient(env);
    const model = AIGateway.normalizeWorkerAiModel(modelToUse);

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: zodToJsonSchema(schema as any, "structured_output"),
          strict: true
        }
      }
    });

    const rawJson = response.choices[0]?.message?.content || "{}";
    const rawParsed = JSON.parse(cleanJsonOutput(rawJson));
    return schema.parse(rawParsed);
  });
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const rawModel = options?.model || STRUCTURING_MODEL;
  return executeWithFallback(env, rawModel, 'function_calling', async (modelToUse) => {
    const client = await getAIClient(env);
    const model = AIGateway.normalizeWorkerAiModel(modelToUse);

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({ model, messages, tools: tools as any });
    const message = response.choices[0]?.message;
    const text = message?.content || "";
    
    const toolCalls = (message?.tool_calls || []).map((tc: any) => ({
      id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
      function: { name: tc.function.name, arguments: tc.function.arguments }
    }));

    return { text, toolCalls };
  });
}

export async function generateStructuredWithTools<T>(
  env: Env,
  prompt: string,
  schema: z.ZodType<T>,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const rawModel = options?.model || STRUCTURING_MODEL;
  return executeWithFallback(env, rawModel, 'function_calling', async (modelToUse) => {
    const client = await getAIClient(env);
    const model = AIGateway.normalizeWorkerAiModel(modelToUse);

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({
      model,
      messages,
      tools: tools as any,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: zodToJsonSchema(schema as any, "structured_output"),
          strict: true
        }
      }
    });

    const message = response.choices[0]?.message;
    const rawJson = message?.content || "{}";
    const rawParsed = JSON.parse(cleanJsonOutput(rawJson));
    const data = schema.parse(rawParsed);
    
    const toolCalls = (message?.tool_calls || []).map((tc: any) => ({
      id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
      function: { name: tc.function.name, arguments: tc.function.arguments }
    }));

    return { data, toolCalls };
  });
}

async function extractRelevantContextViaVectorize(env: Env, prompt: string, files: FileInput[]): Promise<string> {
  let fullText = "";
  for (const file of files) {
    let content = file.data;
    if (file.isBase64) content = Buffer.from(file.data, 'base64').toString('utf-8');
    fullText += `\n--- File: ${file.name} ---\n${content}\n`;
  }

  if (fullText.length <= 6000) return fullText;
  if (!env.FILE_EMBEDDINGS) return fullText.slice(0, 6000); 

  function chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + chunkSize));
      i += chunkSize - overlap;
    }
    return chunks;
  }

  const chunks = chunkText(fullText, 1200, 200);
  const sessionId = `session_${Math.random().toString(36).substr(2, 9)}`;
  const vectorIds: string[] = [];

  try {
    const embeddingResponse = await env.AI.run("@cf/baai/bge-large-en-v1.5", { text: chunks });
    const embeddings = (embeddingResponse as any).data;

    const vectorsToInsert = chunks.map((chunk, idx) => {
      const id = `${sessionId}_chunk_${idx}`;
      vectorIds.push(id);
      return { id, values: embeddings[idx], metadata: { sessionId, text: chunk } };
    });

    await env.FILE_EMBEDDINGS.insert(vectorsToInsert);
    const promptEmbedding = await env.AI.run("@cf/baai/bge-large-en-v1.5", { text: [prompt] });
    const pVector = (promptEmbedding as any).data[0];

    const matches = await env.FILE_EMBEDDINGS.query(pVector, { topK: 5, returnMetadata: true });
    const relevantChunks = matches.matches
      .filter((m: any) => m.metadata && m.metadata.sessionId === sessionId)
      .map((m: any) => m.metadata?.text as string);

    return relevantChunks.join("\n...\n");
  } finally {
    if (vectorIds.length > 0) {
      env.FILE_EMBEDDINGS.deleteByIds(vectorIds).catch((err: any) => console.error("Vector cleanup failed:", err));
    }
  }
}

export async function generateTextFromFiles(
  env: Env,
  prompt: string,
  files: FileInput[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const context = await extractRelevantContextViaVectorize(env, prompt, files);
  const finalPrompt = `Files Context:\n${context}\n\nUser Request: ${prompt}`;
  return generateText(env, finalPrompt, systemPrompt, options);
}

export async function generateStructuredResponseFromFiles<T>(
  env: Env,
  prompt: string,
  files: FileInput[],
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const context = await extractRelevantContextViaVectorize(env, prompt, files);
  const finalPrompt = `Files Context:\n${context}\n\nUser Request: ${prompt}`;
  return generateStructuredResponse(env, finalPrompt, schema, systemPrompt, options);
}

/**
 * Generates a single vector embedding for the given text.
 * Falls back to Workers AI native execution if no OpenAI preset is detected.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param text - Input text.
 * @param model - Target model identifier (e.g., '@cf/baai/bge-large-en-v1.5').
 * @returns Vector array of numbers.
 */
export async function generateEmbedding(env: Env, text: string, model?: string): Promise<number[]> {
  const rawModel = model || env.DEFAULT_MODEL_EMBEDDING || EMBEDDING_MODEL;
  if (!rawModel) throw new Error("DEFAULT_MODEL_EMBEDDING not set.");

  // If the model explicitly requests an OpenAI preset, route through the AI Gateway Compat endpoint
  if (rawModel.startsWith("openai/")) {
    const client = await getAIClient(env);
    const response = await client.embeddings.create({ model: AIGateway.normalizeWorkerAiModel(rawModel), input: text });
    return response.data[0].embedding;
  }

  const response = await env.AI.run(rawModel as any, { text: [text] });
  return (response as any).data[0];
}

export async function generateEmbeddings(env: Env, text: string | string[]): Promise<number[][]> {
  const rawModel = env.DEFAULT_MODEL_EMBEDDING || EMBEDDING_MODEL;
  if (!rawModel) throw new Error("DEFAULT_MODEL_EMBEDDING not set.");
  const inputArray = Array.isArray(text) ? text : [text];

  if (rawModel.startsWith("openai/")) {
    const client = await getAIClient(env);
    const response = await client.embeddings.create({ model: AIGateway.normalizeWorkerAiModel(rawModel), input: inputArray });
    return response.data.map((d: any) => d.embedding);
  }

  const response = await env.AI.run(rawModel as any, { text: inputArray });
  return (response as any).data;
}

export async function getCloudflareModels(env: Env, filter?: ModelFilter): Promise<UnifiedModel[]> {
  const accountId = typeof env.CLOUDFLARE_ACCOUNT_ID === 'string' ? env.CLOUDFLARE_ACCOUNT_ID : await (env.CLOUDFLARE_ACCOUNT_ID as any)?.get();
  
  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID required for getting native models array");
  }

  const { apiKey } = await AIGateway.getBaseUrl(env, { provider: "cloudflare" });
  
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models`, {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });

  if (!res.ok) throw new Error(`Failed to fetch Cloudflare models: ${res.statusText}`);
  const response = await res.json() as any;
  
  // Cloudflare returns an array in 'result'
  const models: UnifiedModel[] = response.result.map((m: any) => {
    const caps: ModelCapability[] = [];
    const name = m.name.toLowerCase();
    const taskName = m.task.name.toLowerCase();
    const description = m.description.toLowerCase();

    if (taskName.includes('image-to-text') || taskName.includes('text-to-image')) caps.push('vision');
    if (description.includes('reasoning') || name.includes('120b') || name.includes('70b')) caps.push('high_reasoning');
    if (name.includes('0.5b') || name.includes('3b') || name.includes('8b') || name.includes('tiny')) caps.push('fast');
    if (taskName === 'text generation') {
      caps.push('structured_response');
      if (name.includes('llama-3') || name.includes('gpt-oss')) caps.push('function_calling');
    }

    // Extract Context Window from properties array
    const contextProp = m.properties?.find((p: any) => p.property_id === 'context_window');
    return {
      id: m.name, 
      provider: 'cloudflare', 
      name: m.name.split('/').pop() || m.name,
      description: m.description, 
      capabilities: caps, 
      maxTokens: contextProp ? parseInt(contextProp.value) : undefined,
      raw: m
    };
  });

  return filter ? models.filter(m => m.capabilities.includes(filter)) : models;
}
