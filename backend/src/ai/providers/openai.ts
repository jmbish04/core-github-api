import OpenAI from "openai";
import { env } from "process";

import { getAIGatewayUrl } from "@/ai/utils/ai-gateway";

export const DEFAULT_OPENAI_MODEL = env.OPENAI_MODEL || "gpt-4o";

/**
 * Initialize OpenAI Client using Cloudflare AI Gateway
 */
export async function createOpenAIClient(env: Env) {
    const apiKey = env.OPENAI_API_KEY;

    return new OpenAI({
        apiKey: await env.AI_GATEWAY_TOKEN.get(),
        baseURL: getAIGatewayUrl(env, { provider: "openai" }),
        // defaultHeaders: {
        //     'cf-aig-authorization': `Bearer ${await env.AI_GATEWAY_TOKEN.get()}`,
        // },
    }) as any;
}

export function getOpenAIModel(env: Env): string {
    return env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

/**
 * Standard query to OpenAI
 */
export async function queryOpenAI(
    env: Env,
    prompt: string,
    systemPrompt?: string
): Promise<string> {
    const client = await createOpenAIClient(env);
    const model = getOpenAIModel(env);

    try {
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: prompt });

        const completion = await client.chat.completions.create({
            model: model,
            messages: messages,
        });

        return completion.choices[0].message.content || "";
    } catch (error) {
        console.error("OpenAI Query Error:", error);
        throw error;
    }
}
