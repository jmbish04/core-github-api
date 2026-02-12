import { GoogleGenAI } from "@google/genai";
import { Bindings } from "../utils/hono";

export interface GeminiClientConfig {
    apiKey: string;
    baseUrl?: string;
}

/**
 * Creates a centralized Gemini client instance.
 * Adheres to the standard usage: const ai = new GoogleGenAI({ apiKey });
 */
export const createGeminiClient = (env: Env) => {
    const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not configured");
    }

    // Configuration options for the client
    // The @google/genai SDK allows passing additional fetch options or base URL properties
    // in the constructor options object if using the new version.
    const options: any = { apiKey };

    if (env.AI_GATEWAY_URL) {
        options.baseURL = env.AI_GATEWAY_URL;
    }

    if (env.AI_GATEWAY_TOKEN) {
        options.defaultHeaders = {
            "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}`,
        };
    }

    const ai = new GoogleGenAI(options);
    return ai;
};
