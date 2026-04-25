import { AIOptions } from "../../types";
import { generateChatTextImpl } from "./chat/text";
import { AIProvider } from "../../index";

/**
 * Health check to verify that the Vercel AI SDK interface (used to bridge assistant-ui)
 * is functioning correctly and successfully connecting through AI Gateway.
 */
export async function checkVercelHealth(env: Env): Promise<{ status: string; error?: string; latency?: number }> {
    const start = Date.now();
    try {
        const provider = new AIProvider(env);
        
        // Use a fast, reliable model through the Vercel abstraction
        const options: AIOptions = {
            provider: "openai",
            model: "gpt-4o-mini",
            maxTokens: 5,
        };

        const response = await generateChatTextImpl(
            provider,
            [{ role: "user", content: "Reply with exactly one word: health-ok" }],
            "You are a diagnostic bot.",
            options
        );

        if (!response || !response.toLowerCase().includes("health-ok")) {
            throw new Error(`Invalid response from Vercel interface: ${response}`);
        }

        return { status: "OK", latency: Date.now() - start };
    } catch (err: any) {
        return { status: "FAILURE", error: err.message, latency: Date.now() - start };
    }
}
