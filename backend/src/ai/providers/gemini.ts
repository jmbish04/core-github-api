// Dynamically imported
import { getAiGatewayUrl, resolveDefaultAiModel } from "./config";
import { getAIGatewayUrl as getRawGatewayUrl } from "../utils/ai-gateway";
import { getGeminiApiKey } from "@utils/secrets";
import { cleanJsonOutput } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

export async function createGeminiClient(env: Env, model: string) {
  // @ts-ignore
  const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN as string;

  // "Key in Request + Authenticated Gateway" pattern:
  // - apiKey: REAL Gemini key (SDK sends this as ?key= to Google)
  // - cf-aig-authorization: gateway token (for gateway auth/logging)
  // The gateway forwards the real key to upstream; BYOK is NOT used here.
  const apiKey = await getGeminiApiKey(env);

  if (!apiKey || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Missing GEMINI_API_KEY and CLOUDFLARE_ACCOUNT_ID");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const baseUrl = await getRawGatewayUrl(env, { provider: "google-ai-studio" });
  
  // Enforce v1 for Gemini 1.5 Series, otherwise fallback to v1beta for new/preview models
  const apiVersion = model.includes("gemini-1.5") ? "v1" : "v1beta";

  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      baseUrl,
      apiVersion,
      headers: aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : undefined,
    },
  });
}

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const testModel = "gemini-1.5-flash";
    const client = await createGeminiClient(env, testModel);
    await client.models.get({ model: testModel });
    return true;
  } catch (error) {
    console.error("Gemini Verification Error:", error);
    return false;
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return response.text || "";
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      responseMimeType: "application/json",
      responseSchema: schema as any,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return JSON.parse(cleanJsonOutput(response.text || "{}")) as T;
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const functionDeclarations = tools.map((t) => t.function);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      tools: [{ functionDeclarations }] as any,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  const toolCalls = response.functionCalls?.map((call, index) => ({
    id: `call_${index}`, // Gemini does not provide UUIDs for tools natively in the standard layout
    function: {
      name: call.name || "unknown",
      arguments: JSON.stringify(call.args || {})
    }
  })) || [];

  return {
    text: response.text || "",
    toolCalls,
  };
}

export async function generateStructuredWithTools<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const functionDeclarations = tools.map((t) => t.function);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      tools: [{ functionDeclarations }] as any,
      responseMimeType: "application/json",
      responseSchema: schema as any,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  const toolCalls = response.functionCalls?.map((call, index) => ({
    id: `call_${index}`,
    function: {
      name: call.name || "unknown",
      arguments: JSON.stringify(call.args || {})
    }
  })) || [];

  return {
    data: JSON.parse(cleanJsonOutput(response.text || "{}")) as T,
    toolCalls,
  };
}