/**
 * Anthropic AI Provider Integration
 * 
 * Provides an interface to Anthropic's Claude models via the official SDK, 
 * routed through Cloudflare AI Gateway for observability and centralized auth.
 * Support for text generation, structured responses, and tool calling.
 * 
 * @module AI/Providers/Anthropic
 */

import { resolveDefaultAiModel } from "../ai-gateway/config";
import { cleanJsonOutput } from "@/ai/utils/sanitizer";
import { Logger } from "@/lib/logger";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse, UnifiedModel, ModelFilter, ToolCall } from "../types";
import { Agent, tool, run } from "@openai/agents";
import { setupOpenAIAgentClient } from "../clients";

import { verifyApiKey as verify } from '@/ai/providers/ai-gateway/keys';
import { normalizeModelForGateway } from '../ai-gateway/normalize';

export async function verifyApiKey(env: Env): Promise<boolean> {
  return verify(env, 'anthropic');
}

async function executeWithFallback<T>(
  env: Env, originalModel: string, requiredCapability: ModelFilter | undefined,
  executionFn: (model: string) => Promise<T>
): Promise<T> {
  try {
    return await executionFn(originalModel);
  } catch (error: any) {
    console.warn(`[Anthropic Fallback] Initial execution failed for model ${originalModel}:`, error?.message);
    const models = await getAnthropicModels(env);
    const fallbackModelInfo = models.find(m => m.id !== originalModel && (!requiredCapability || m.capabilities.includes(requiredCapability)));
    
    if (!fallbackModelInfo) throw error;
    console.warn(`[Anthropic Fallback] Retrying with alternative model: ${fallbackModelInfo.id}`);
    return await executionFn(fallbackModelInfo.id);
  }
}

export async function generateText(env: Env, prompt: string, systemPrompt?: string, options?: AIOptions): Promise<string> {
  const initialModel = options?.model || resolveDefaultAiModel(env, "anthropic");
  return executeWithFallback(env, initialModel, undefined, async (model) => {
    const namespacedModel = normalizeModelForGateway("anthropic", model);
    await setupOpenAIAgentClient(env, "anthropic");
    
    const agent = new Agent({
      name: "Anthropic_Agent",
      instructions: systemPrompt || "You are a helpful assistant.",
      model: namespacedModel,
    });

    const result = await run(agent, prompt);
    return String(result.finalOutput ?? "");
  });
}

export async function generateStructuredResponse<T = any>(env: Env, prompt: string, schema: object, systemPrompt?: string, options?: AIOptions): Promise<T> {
  const initialModel = options?.model || resolveDefaultAiModel(env, "anthropic");
  return executeWithFallback(env, initialModel, 'structured_response', async (model) => {
    const namespacedModel = normalizeModelForGateway("anthropic", model);
    const client = await setupOpenAIAgentClient(env, "anthropic");
    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({
      model: namespacedModel, messages, temperature: options?.temperature, max_tokens: options?.maxTokens,
      response_format: { type: "json_schema", json_schema: { name: "structured_output", schema: schema as any, strict: true } }
    });
    return JSON.parse(cleanJsonOutput(response.choices[0]?.message?.content || "{}")) as T;
  });
}

export async function generateTextWithTools(env: Env, prompt: string, tools: any[], systemPrompt?: string, options?: AIOptions): Promise<TextWithToolsResponse> {
  const initialModel = options?.model || resolveDefaultAiModel(env, "anthropic");
  return executeWithFallback(env, initialModel, 'function_calling', async (model) => {
    const namespacedModel = normalizeModelForGateway("anthropic", model);
    await setupOpenAIAgentClient(env, "anthropic");

    const capturedToolCalls: ToolCall[] = [];
    const agentTools = tools.map((t, idx) => {
       const functionDef = t.function;
       return tool({
           name: functionDef.name,
           description: functionDef.description || "",
           parameters: functionDef.parameters || {},
           execute: async (args: any) => {
               capturedToolCalls.push({
                   id: `call_${idx}_${Date.now()}`,
                   function: {
                       name: functionDef.name,
                       arguments: JSON.stringify(args)
                   }
               });
               return "Tool execution deferred to caller";
           }
       });
    });

    const agent = new Agent({
      name: "Anthropic_Agent",
      instructions: systemPrompt || "You are a helpful assistant.",
      model: namespacedModel,
      tools: agentTools,
      toolUseBehavior: 'run_llm_again'
    });

    const result = await run(agent, prompt);
    
    return {
      text: String(result.finalOutput || ""),
      toolCalls: capturedToolCalls
    };
  });
}

export async function generateStructuredWithTools<T = any>(env: Env, prompt: string, schema: object, tools: any[], systemPrompt?: string, options?: AIOptions): Promise<StructuredWithToolsResponse<T>> {
  const initialModel = options?.model || resolveDefaultAiModel(env, "anthropic");
  return executeWithFallback(env, initialModel, 'function_calling', async (model) => {
    const namespacedModel = normalizeModelForGateway("anthropic", model);
    const client = await setupOpenAIAgentClient(env, "anthropic");
    
    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({
      model: namespacedModel, messages, tools, temperature: options?.temperature, max_tokens: options?.maxTokens,
      response_format: { type: "json_schema", json_schema: { name: "structured_output", schema: schema as any, strict: true } }
    });
    const msg = response.choices[0]?.message;
    return {
      data: JSON.parse(cleanJsonOutput(msg?.content || "{}")) as T,
      toolCalls: msg?.tool_calls?.map((tc: any) => ({ id: tc.id, function: { name: tc.function?.name, arguments: tc.function?.arguments } })) || []
    };
  });
}

export async function getAnthropicModels(env: Env, filter?: ModelFilter): Promise<UnifiedModel[]> {
  try {
    const client = await setupOpenAIAgentClient(env, "anthropic");
    const res = await client.models.list();
    const data = res.data || [];
    
    const models: UnifiedModel[] = data.map((m: any) => {
      const caps: ModelFilter[] = ['vision', 'function_calling'];
      if (m.id.includes('haiku')) caps.push('fast');
      if (m.id.includes('opus')) caps.push('high_reasoning');
      return {
        id: m.id, provider: 'anthropic', name: m.id,
        description: `Anthropic ${m.id} model`, capabilities: caps, raw: m
      };
    });
    return filter ? models.filter(m => m.capabilities.includes(filter)) : models;
  } catch (e) {
    console.error("Error fetching Anthropic models:", JSON.stringify(e));
    return [];
  }
}
