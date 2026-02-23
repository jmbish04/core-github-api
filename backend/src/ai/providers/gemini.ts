// Dynamically imported
import { getAiGatewayUrl, resolveDefaultAiModel } from "./config";
import { getGeminiApiKey } from "@utils/secrets";
import { cleanJsonOutput } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

export async function createGeminiClient(env: Env) {
  // @ts-ignore
  const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN as string;

  // When AI Gateway is configured, provider keys are stored IN the gateway.
  // The SDK sends the gateway token as apiKey — the gateway intercepts and
  // replaces it with the real provider key before forwarding upstream.
  const apiKey = aigToken || await getGeminiApiKey(env);

  if (!apiKey || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Missing (GEMINI_API_KEY or AI_GATEWAY_TOKEN) and CLOUDFLARE_ACCOUNT_ID");
  }

  const { GoogleGenAI } = await import("@google/genai");
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      baseUrl: await getAiGatewayUrl(env, "google-ai-studio", "google_sdk"),
      headers: aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : undefined
    },
  });
}

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const client = await createGeminiClient(env);
    await client.models.get({ model: "gemini-2.5-pro" });
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
  const client = await createGeminiClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "gemini");

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
  const client = await createGeminiClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "gemini");

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
  const client = await createGeminiClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "gemini");

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
  const client = await createGeminiClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "gemini");

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