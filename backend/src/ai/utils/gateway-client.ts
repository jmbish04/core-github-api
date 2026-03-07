import { OpenAIProvider, Runner, ModelProvider } from "@openai/agents";

/**
 * Universal Client Factory
 * Configures the raw OpenAI SDK to route through Cloudflare AI Gateway's 
 * universal translation endpoint (/compat). Useful for connection verification
 * and fallback loops.
 */
export async function createUniversalGatewayClient(
    env: any,
    apiKey: string
): Promise<any> {
    const gatewayName = env.AI_GATEWAY_NAME || `core-github-api` || `default-gateway`;
    const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get 
        ? await (env.AI_GATEWAY_TOKEN as any).get() 
        : env.AI_GATEWAY_TOKEN as string;

    const baseURL = env.AI.gateway(gatewayName).url('compat');

    // Hijack the global process environment to reroute the underlying fetcher
    // This allows the @openai/agents SDK to initialize without needing the raw manual 'openai' instantiation
    (globalThis as any).process = { 
      env: { 
        ...((globalThis as any).process?.env || {}),
        OPENAI_API_KEY: apiKey || "cf-aig-dummy-key",
        OPENAI_BASE_URL: baseURL,
      } 
    };

// Default dummy client that uses fetch for raw gateway requests
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
    } as any;
}

/**
 * Universal Runner Factory
 * Configures the OpenAI Agents SDK Runner to route through Cloudflare AI Gateway's
 * /compat endpoint.
 */
export async function createUniversalGatewayRunner(
    env: any,
    apiKey: string,
    model: string
): Promise<Runner> {

    await createUniversalGatewayClient(env, apiKey);

    const modelProvider: ModelProvider = new (OpenAIProvider as any)();

    return new Runner({ modelProvider, model });
}
