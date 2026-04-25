import { OpenAI } from 'openai';
import { AIGateway } from '@/ai/providers/ai-gateway';
import { SupportedProvider } from '@/ai/providers/ai-gateway/config';

/**
 * Creates a native OpenAI Chat SDK client configured to route through Cloudflare AI Gateway
 * using OpenAI compatible mode. 
 */
export async function createOpenAIChatClient(
  env: Env,
  provider: SupportedProvider | 'cloudflare' | 'google' = 'worker-ai'
): Promise<OpenAI> {
  const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, {
    provider,
    endpoint: 'chat',
    openai_compatible: true
  });

  const headers: Record<string, string> = {};
  if (aigToken) {
    headers['cf-aig-authorization'] = `Bearer ${aigToken}`;
  }

  return new OpenAI({
    baseURL: AIGateway.formatBaseUrlForClient(baseUrl, 'openai_sdk'),
    apiKey: apiKey || 'dummy-key',
    defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
  });
}
