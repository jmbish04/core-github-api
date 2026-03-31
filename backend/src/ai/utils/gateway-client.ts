import { getAiGatewayUrlForOpenAI } from "@/ai/utils/ai-gateway";

export async function createUniversalGatewayClient(env: any, apiKey: string): Promise<any> {
    const gatewayName = env.AI_GATEWAY_NAME || `core-github-api`;
    const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get 
        ? await (env.AI_GATEWAY_TOKEN as any).get() 
        : env.AI_GATEWAY_TOKEN as string;
    const baseURL = env.AI.gateway(gatewayName).url('compat');

    return {
        chat: {
            completions: {
                create: async (body: any) => {
                    const res = await fetch(baseURL + '/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey || "dummy-key"}`,
                            'cf-aig-authorization': `Bearer ${aigToken}`
                        },
                        body: JSON.stringify(body)
                    });
                    if (!res.ok) throw new Error(`Gateway Error: ${await res.text()}`);
                    return await res.json();
                }
            }
        },
        models: {
            list: async () => {
                const res = await fetch(baseURL + '/models', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey || "dummy-key"}`,
                        'cf-aig-authorization': `Bearer ${aigToken}`
                    }
                });
                if (!res.ok) throw new Error(`Gateway Error: ${await res.text()}`);
                return await res.json();
            }
        }
    };
}

export async function runTextWithModelFallback(
    env: any,
    provider: string,
    model: string,
    instructions: string,
    prompt: string
): Promise<string> {
    const client = await createUniversalGatewayClient(env, await getApiKeyForProvider(env, provider));
    const response = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: instructions },
            { role: "user", content: prompt }
        ]
    });
    return response.choices?.[0]?.message?.content || "";
}

export async function runStructuredResponseWithModelFallback(
    env: any,
    provider: string,
    model: string,
    instructions: string,
    prompt: string
): Promise<any> {
    const gatewayName = env.AI_GATEWAY_NAME || `core-github-api`;
    const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get 
        ? await (env.AI_GATEWAY_TOKEN as any).get() 
        : env.AI_GATEWAY_TOKEN as string;

    const apiKey = await getApiKeyForProvider(env, provider);
    const baseURL = env.AI.gateway(gatewayName).url('compat');

    const res = await fetch(baseURL + '/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || "dummy-key"}`,
            'cf-aig-authorization': `Bearer ${aigToken}`
        },
        body: JSON.stringify({ 
           model,
           messages: [
               { role: "system", content: instructions },
               { role: "user", content: prompt }
           ]
        })
    });
    
    if (!res.ok) throw new Error(`Gateway Error: ${await res.text()}`);
    const json: any = await res.json();
    const result = json.choices?.[0]?.message?.content || "{}";
    
    try {
        const jsonString = result.replace(/```json\\n/g, "").replace(/```/g, "").trim();
        return JSON.parse(jsonString);
    } catch(e) {
        return { reply: result };
    }
}

/**
 * Creates a runner that wraps the Agents SDK with a Universal Gateway client.
 * Returns an object with a `run(agent, prompt)` method compatible with @openai/agents.
 */
export async function createUniversalGatewayRunner(
    env: any,
    apiKey: string,
    model: string
): Promise<{ run: (agent: any, prompt: string) => Promise<{ finalOutput: string }> }> {
    const client = await createUniversalGatewayClient(env, apiKey);
    return {
        run: async (_agent: any, prompt: string) => {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: _agent?.instructions || 'You are a helpful assistant.' },
                    { role: 'user', content: prompt }
                ]
            });
            const finalOutput = response.choices?.[0]?.message?.content || '';
            return { finalOutput };
        }
    };
}

async function getApiKeyForProvider(env: any, provider: string): Promise<string> {
    try {
        if (provider.includes('anthropic')) return await env.ANTHROPIC_API_KEY?.get();
        if (provider.includes('gemini') || provider.includes('google')) return await env.GEMINI_API_KEY?.get();
        return await env.OPENAI_API_KEY?.get() || "dummy";
    } catch {
        return "dummy";
    }
}
