

const GATEWAY_PROVIDER_ALIASES: Record<string, string> = {
  "worker-ai": "workers-ai",
  "workers-ai": "workers-ai",
  openai: "openai",
  gemini: "google-ai-studio",
  google: "google-ai-studio",
  "google-ai-studio": "google-ai-studio",
  anthropic: "anthropic",
};

export function normalizeAiGatewayProvider(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  return GATEWAY_PROVIDER_ALIASES[normalized] || normalized;
}

export async function getAiGatewayUrl(env: Env, provider: string): Promise<string> {
  try {
    const normalizedProvider = normalizeAiGatewayProvider(provider);
    const gateway = env.AI.gateway(env.AI_GATEWAY_NAME);
    const baseUrl = await gateway.getUrl(normalizedProvider);
    return baseUrl;
  } catch (error: any) {
    console.error(`Failed to resolve AI Gateway URL for provider: ${provider}`, error);
    throw new Error(`Could not fetch gateway URL: ${error.message}`);
  }
}

// Backward-compatible alias used by existing callsites.
export async function getAiBaseUrl(env: Env, provider: string): Promise<string> {
  return getAiGatewayUrl(env, provider);
}
