/**
 * AI Gateway Model & Provider Normalization
 * 
 * Handles mapping and translating internal provider mappings (e.g. "gemini")
 * to the literal string keys expected by Cloudflare AI Gateway 
 * (e.g. "google-ai-studio") and parsing model slugs.
 * 
 * @module AI/Providers/AIGateway/Normalize
 */
import { Logger } from '@/lib/logger';
import { getApiKeyForProvider } from './keys';
import { getSecret } from '@/utils/secrets';
import type { GatewayUseCase } from './config';

export const GATEWAY_PROVIDER_ALIASES: Record<string, string> = {
  "gemini": "google-ai-studio",
  "google": "google-ai-studio",
  "google-ai-studio": "google-ai-studio",
  "workers-ai": "workers-ai",
  "worker-ai": "workers-ai",
  "cloudflare": "workers-ai",
  "openai": "openai",
  "anthropic": "anthropic",
  "jules": "jules",
};

export const ENDPOINT_PATHS = {
  chat: '/v1/chat/completions',
  models: '/v1/models',
} as const;

export function normalizeProvider(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  return GATEWAY_PROVIDER_ALIASES[normalized] || 'compat';
}

export function normalizeModelForGateway(provider: string, model: string): string {
  const normalizedProvider = normalizeProvider(provider);
  if (model.includes('/')) {
    return model;
  }
  return `${normalizedProvider}/${model}`;
}

export function normalizeWorkerAiModel(model: string): string {
  const parts = model.trim().split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Invalid model format: ${model}. Expected at least provider/model.`);
  }
  if (parts.length === 2 && parts[0] === '@cf') {
    throw new Error(`Invalid model format: ${model}. Model name missing after @cf/.`);
  }
  if (parts.length === 2) {
    return `workers-ai/@cf/${parts.join('/')}`;
  }
  return `workers-ai/@cf/${parts.slice(-2).join('/')}`;
}



/**
 * Adapts a resolved Gateway URL for a specific downstream client SDK.
 * SDKs like OpenAI auto-append `/chat/completions`, so we must strip it
 * from the gateway URL to prevent double-pathing (e.g. `/v1/chat/completions/chat/completions`).
 */
export function formatBaseUrlForClient(baseUrl: string, useCase: GatewayUseCase): string {
  let url = baseUrl.replace(/\/+$/, "");

  switch (useCase) {
    case 'openai_sdk':
    case 'openai_agents_sdk':
      // OpenAI SDK auto-appends /chat/completions to baseURL.
      // Strip to /v1 so it doesn't double up.
      if (url.endsWith(ENDPOINT_PATHS.chat)) {
        url = url.slice(0, -ENDPOINT_PATHS.chat.length);
      } else if (url.endsWith('/chat/completions')) {
        url = url.replace(/\/chat\/completions$/, "");
      }
      break;

    case 'anthropic_sdk':
      // Anthropic SDK appends /v1/messages internally.
      if (url.endsWith(ENDPOINT_PATHS.chat)) {
        url = url.slice(0, -ENDPOINT_PATHS.chat.length);
      } else if (url.endsWith('/v1/messages')) {
        url = url.replace(/\/v1\/messages$/, "");
      }
      break;

    case 'google_sdk':
      if (url.endsWith(ENDPOINT_PATHS.chat)) {
        url = url.slice(0, -ENDPOINT_PATHS.chat.length);
      }
      break;

    case 'worker_ai':
      // Raw fetch — return as-is
      break;
  }

  return url;
}

export async function getBaseUrl(
  env: any, 
  options: { provider: string, endpoint?: 'chat' | 'models', openai_compatible?: boolean }
): Promise<{ baseUrl: string, apiKey: string, aigToken: string }> {
  const gatewayName = env.AI_GATEWAY_NAME || 'core-github-api';
  let aigToken = '';
  // Will fallback to KV or Secrets Store if not directly available
  const token = await getSecret(env, 'AI_GATEWAY_TOKEN');
  if (token) {
    aigToken = token;
  }

  const normalizedProvider = normalizeProvider(options.provider);
  
  // workers-ai is always compat no matter what
  const isCompat = normalizedProvider === 'workers-ai' ? true : (options.openai_compatible ?? false);

  const apiKey = aigToken ? '' : await getApiKeyForProvider(env, options.provider);

  const logger = new Logger(env, 'AIGateway');
  try {
    const gateway = env.AI.gateway(gatewayName);
    let baseUrl = '';

    if (isCompat) {
      // Run provider in openai compatible mode
      baseUrl = await gateway.getUrl('compat');
      baseUrl = baseUrl.replace(/\/+$/, "");
      if (options.endpoint) {
        baseUrl = `${baseUrl}${ENDPOINT_PATHS[options.endpoint]}`;
      }
    } else {
      // Provider specific routing
      baseUrl = await gateway.getUrl(normalizedProvider);
      baseUrl = baseUrl.replace(/\/+$/, "");
      // In provider-specific routing, we return the base URL without appending /v1/chat/completions
    }

    logger.info(`getBaseUrl resolved`, { 
      provider: options.provider, 
      normalized: normalizedProvider, 
      baseUrl, 
      mode: aigToken ? 'BYOK' : 'direct', 
      endpoint: options.endpoint || 'raw',
      compat: isCompat
    });
    await logger.flush();

    return { baseUrl, apiKey, aigToken };
  } catch (error: any) {
    logger.error(`Failed to resolve URL for provider=${options.provider}`, { error: error.message, stack: error.stack });
    await logger.flush();
    throw new Error(`Could not fetch gateway URL: ${error.message}`);
  }
}
