import { createOpenAI } from "@ai-sdk/openai";
import { AIGateway } from "@/ai/providers/ai-gateway";

export async function createVercelOpenAIClient(env: Env, providerName: string) {
  const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, {
    provider: providerName as any,
    endpoint: 'chat',
    openai_compatible: true
  });

  const headers: Record<string, string> = {};
  if (aigToken) {
    headers['cf-aig-authorization'] = `Bearer ${aigToken}`;
  }

  return createOpenAI({
    baseURL: AIGateway.formatBaseUrlForClient(baseUrl, 'openai_sdk'),
    apiKey: apiKey || 'dummy-key',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}



export * from './types';
export * from './chat';
