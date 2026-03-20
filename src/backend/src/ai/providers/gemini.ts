/**
 * Implements the Gemini provider using the `openai/agents sdk`
 * Features:
 * 1. BYOK (Bring Your Own Key) via Cloudflare AI Gateway.
 * 2. Fetch interception to inject Gateway Auth and strip dummy keys.
 * 3. Support for text, structured JSON, vision, and function calling.
 * 4. Automatic model fallback orchestration.
 * 
 * @module AI/Providers/Gemini
 */
import { cleanJsonOutput } from "@/ai/utils/sanitizer";
import { AIGateway } from "../utils/ai-gateway";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse, ModelCapability, UnifiedModel, ModelFilter, FileInput } from "./index";
import { z } from "zod";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const REASONING_GEMINI_MODEL = "gemini-2.5-pro";

async function getGeminiClient(env: Env): Promise<any> {
    const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, { provider: "gemini" });

    return {
        generateContent: async (model: string, data: any) => {
            const res = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(aigToken ? { "cf-aig-authorization": `Bearer ${aigToken}` } : {})
                },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`Gemini API Error: ${await res.text()}`);
            return await res.json();
        },
        getModels: async () => {
            const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`, {
                method: "GET",
                headers: {
                    ...(aigToken ? { "cf-aig-authorization": `Bearer ${aigToken}` } : {})
                }
            });
            if (!res.ok) throw new Error(`Gemini API Error (Models): ${await res.text()}`);
            return await res.json();
        }
    };
}

export async function verifyApiKey(env: Env): Promise<boolean> {
    try {
        const { apiKey } = await AIGateway.getBaseUrl(env, { provider: "gemini" });
        return apiKey !== "dummy";
    } catch {
        return false;
    }
}

async function executeWithFallback<T>(
  env: Env, originalModel: string, requiredCapability: ModelFilter | undefined,
  executionFn: (model: string) => Promise<T>
): Promise<T> {
  try {
    return await executionFn(originalModel);
  } catch (error: any) {
    console.warn(`[Gemini Fallback] Initial execution failed for model ${originalModel}:`, error?.message);
    const models = await getGoogleModels(env);
    const fallbackModelInfo = models.find(m => m.id !== originalModel && (!requiredCapability || m.capabilities.includes(requiredCapability)));
    
    if (!fallbackModelInfo) throw error;
    console.warn(`[Gemini Fallback] Retrying with alternative model: ${fallbackModelInfo.id}`);
    return await executionFn(fallbackModelInfo.id);
  }
}

export async function generateText(env: Env, prompt: string, systemPrompt?: string, options?: AIOptions): Promise<string> {
    const rawModel = options?.model || DEFAULT_GEMINI_MODEL;
    return executeWithFallback(env, rawModel, undefined, async (model) => {
        const client = await getGeminiClient(env);
        const msgs = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;
        const body: any = { contents: [{ role: "user", parts: [{ text: msgs }] }] };
        
        const res = await client.generateContent(model, body);
        return res.candidates?.[0]?.content?.parts?.[0]?.text || "";
    });
}

export async function generateStructuredResponse<T>(env: Env, prompt: string, schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions): Promise<T> {
    const rawModel = options?.model || DEFAULT_GEMINI_MODEL;
    return executeWithFallback(env, rawModel, 'structured_response', async (model) => {
        const client = await getGeminiClient(env);
        const msgs = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;
        
        const body: any = { 
            contents: [{ role: "user", parts: [{ text: msgs }] }],
            generationConfig: { responseMimeType: "application/json" }
        };
        
        const res = await client.generateContent(model, body);
        const text = res.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const rawParsed = JSON.parse(cleanJsonOutput(text));
        return schema.parse(rawParsed);
    });
}

export async function generateTextWithTools(env: Env, prompt: string, tools: any[], systemPrompt?: string, options?: AIOptions): Promise<TextWithToolsResponse> {
    const model = options?.model || DEFAULT_GEMINI_MODEL;
    const client = await getGeminiClient(env);
    const msgs = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;

    const functionDeclarations = tools.map((t: any) => ({
        name: t.function?.name || t.name,
        description: t.function?.description || t.description,
        parameters: t.function?.parameters || t.parameters
    }));

    const body: any = { 
        contents: [{ role: "user", parts: [{ text: msgs }] }],
        tools: [{ functionDeclarations }]
    };

    const res = await client.generateContent(model, body);
    const candidate = res.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    let textOut = "";
    const toolCalls: any[] = [];

    for (const part of parts) {
        if (part.text) textOut += part.text;
        if (part.functionCall) {
            toolCalls.push({
                id: `call_${Math.random().toString(36).substr(2, 9)}`,
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {})
                }
            });
        }
    }

    return { text: textOut, toolCalls };
}

export async function generateStructuredWithTools<T>(env: Env, prompt: string, schema: z.ZodType<T>, tools: any[], systemPrompt?: string, options?: AIOptions): Promise<StructuredWithToolsResponse<T>> {
    const model = options?.model || DEFAULT_GEMINI_MODEL;
    const client = await getGeminiClient(env);
    const msgs = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}\n\nPlease respond exclusively using the specified JSON schema structure if no tools are required.` : prompt;

    const functionDeclarations = tools.map((t: any) => ({
        name: t.function?.name || t.name,
        description: t.function?.description || t.description,
        parameters: t.function?.parameters || t.parameters
    }));

    const body: any = { 
        contents: [{ role: "user", parts: [{ text: msgs }] }],
        tools: [{ functionDeclarations }]
    };

    const res = await client.generateContent(model, body);
    const candidate = res.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    let textOut = "";
    const toolCalls: any[] = [];

    for (const part of parts) {
        if (part.text) textOut += part.text;
        if (part.functionCall) {
            toolCalls.push({
                id: `call_${Math.random().toString(36).substr(2, 9)}`,
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {})
                }
            });
        }
    }

    let parsedData: any = {};
    if (textOut) {
        try {
            parsedData = JSON.parse(cleanJsonOutput(textOut));
        } catch {
            parsedData = {};
        }
    }

    return { data: schema.parse(parsedData), toolCalls };
}

export async function generateTextFromFiles(env: Env, prompt: string, files: FileInput[], systemPrompt?: string, options?: AIOptions): Promise<string> {
    const model = options?.model || DEFAULT_GEMINI_MODEL;
    const client = await getGeminiClient(env);

    const parts: any[] = files.map(file => ({
        inlineData: { mimeType: file.type || "text/plain", data: file.isBase64 ? file.data : Buffer.from(file.data).toString("base64") }
    }));
    parts.push({ text: systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt });

    const body: any = { contents: [{ role: "user", parts }] };
    const res = await client.generateContent(model, body);
    return res.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function generateStructuredResponseFromFiles<T>(env: Env, prompt: string, files: FileInput[], schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions): Promise<T> {
    const model = options?.model || DEFAULT_GEMINI_MODEL;
    const client = await getGeminiClient(env);

    const parts: any[] = files.map(file => ({
        inlineData: { mimeType: file.type || "text/plain", data: file.isBase64 ? file.data : Buffer.from(file.data).toString("base64") }
    }));
    parts.push({ text: systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt });

    const body: any = { 
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" }
    };

    const res = await client.generateContent(model, body);
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const rawParsed = JSON.parse(cleanJsonOutput(text));
    return schema.parse(rawParsed);
}

export async function getGoogleModels(env: Env, filter?: ModelFilter): Promise<UnifiedModel[]> {
    let data: any;
    try {
        const client = await getGeminiClient(env);
        data = await client.getModels();
    } catch (error: any) {
        console.error("Failed to fetch Google models:", error.message);
        return [];
    }
    const models: UnifiedModel[] = (data.models || []).map((m: any) => {
        const capabilities: ModelCapability[] = ["fast"];
        const nameId = (m.name || "").replace("models/", "");
        
        if (nameId.includes("flash")) {
            capabilities.push("structured_response", "function_calling", "vision");
        }
        if (nameId.includes("pro")) {
            capabilities.push("structured_response", "function_calling", "vision", "high_reasoning");
        }
        if (nameId.includes("thinking")) {
            capabilities.push("structured_response", "function_calling", "high_reasoning");
        }
        
        return {
            id: nameId,
            provider: "google",
            name: m.displayName || nameId,
            description: m.description || "",
            capabilities,
            maxTokens: m.inputTokenLimit || 1048576,
            raw: m
        };
    });

    return filter ? models.filter(m => m.capabilities.includes(filter)) : models;
}