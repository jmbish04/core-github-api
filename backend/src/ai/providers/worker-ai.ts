import { resolveDefaultAiModel } from "./config";
import { cleanJsonOutput, sanitizeAndFormatResponse } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

const REASONING_MODEL = "@cf/openai/gpt-oss-120b";
const STRUCTURING_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { prompt: "hi", max_tokens: 1 });
    return true;
  } catch (error) {
    console.error("Workers AI Verification Error:", error);
    return false;
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const model = options?.model || resolveDefaultAiModel(env, "worker-ai") || REASONING_MODEL;

  const payload: any = {
    messages: []
  };
  
  if (systemPrompt) payload.messages.push({ role: "system", content: systemPrompt });
  payload.messages.push({ role: "user", content: prompt });

  try {
    const response = await env.AI.run(model as any, payload);
    let textResult = "";

    if (typeof response === "object" && response !== null && "response" in response) {
      textResult = (response as any).response;
    } else {
      textResult = String(response);
    }

    if (options?.sanitize) {
      return sanitizeAndFormatResponse(textResult);
    }

    return textResult;
  } catch (error) {
    console.error("Workers AI Text Generation Error:", error);
    throw error;
  }
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const model = options?.model || STRUCTURING_MODEL;

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const response = await env.AI.run(model as any, {
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: schema,
          strict: true
        }
      }
    });

    if (typeof response === "object" && response !== null && "response" in response) {
      const rawJson = (response as any).response;
      return typeof rawJson === "object" ? rawJson as T : JSON.parse(cleanJsonOutput(String(rawJson))) as T;
    }
    throw new Error("Unexpected response format from Workers AI");
  } catch (error) {
    console.error("Workers AI Structured Error:", error);
    throw error;
  }
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const model = options?.model || STRUCTURING_MODEL;

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const response = await env.AI.run(model as any, { messages, tools });
    let text = "";
    let toolCalls = [];

    if (typeof response === "object" && response !== null) {
      text = (response as any).response || "";
      const rawCalls = (response as any).tool_calls || [];
      toolCalls = rawCalls.map((tc: any) => ({
        id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
        function: {
          name: tc.name || tc.function?.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {})
        }
      }));
    }

    return { text, toolCalls };
  } catch (error) {
    console.error("Workers AI Tools Error:", error);
    throw error;
  }
}

export async function generateStructuredWithTools<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const model = options?.model || STRUCTURING_MODEL;

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const response = await env.AI.run(model as any, {
      messages,
      tools,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: schema,
          strict: true
        }
      }
    });

    let data = {} as T;
    let toolCalls = [];

    if (typeof response === "object" && response !== null) {
      const rawJson = (response as any).response;
      data = typeof rawJson === "object" ? rawJson as T : JSON.parse(cleanJsonOutput(String(rawJson || "{}"))) as T;
      
      const rawCalls = (response as any).tool_calls || [];
      toolCalls = rawCalls.map((tc: any) => ({
        id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
        function: {
          name: tc.name || tc.function?.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {})
        }
      }));
    }

    return { data, toolCalls };
  } catch (error) {
    console.error("Workers AI Structured Tools Error:", error);
    throw error;
  }
}

export async function generateEmbedding(env: Env, text: string): Promise<number[]> {
  const model = (env as any).DEFAULT_MODEL_EMBEDDING;
  if (!model) {
    throw new Error("DEFAULT_MODEL_EMBEDDING is not set in environment variables.");
  }

  try {
    const response = await env.AI.run(model, { text: [text] });
    return (response as any).data[0];
  } catch (error) {
    console.error(`Workers AI Embedding Error (${model}):`, error);
    throw error;
  }
}