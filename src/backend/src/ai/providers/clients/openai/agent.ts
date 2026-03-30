import { OpenAI } from 'openai';
import { Agent } from '@openai/agents';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import { AIGateway } from '@/ai/providers/ai-gateway';
import { SupportedProvider } from '@/ai/providers/ai-gateway/config';

export interface OpenAIAgentOptions {
  name: string;
  instructions: string;
  model?: string; 
  tools?: any[];
}

/**
 * Creates and configures an OpenAI Agent using the @openai/agents SDK,
 * routed through Cloudflare AI Gateway in compat mode.
 */
export async function setupOpenAIAgentClient(
  env: Env,
  provider: SupportedProvider | 'cloudflare' | 'google'
): Promise<OpenAI> {
  const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, {
    provider,
    endpoint: 'chat',
    openai_compatible: true
  });

  const openai = new OpenAI({
    baseURL: baseUrl,
    apiKey: apiKey || 'dummy-key',
    defaultHeaders: aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : undefined,
  });

  setDefaultOpenAIClient(openai);
  return openai;
}

export async function createOpenAIAgent(
  env: Env,
  provider: SupportedProvider | 'cloudflare' | 'google',
  options: OpenAIAgentOptions
): Promise<Agent> {
  await setupOpenAIAgentClient(env, provider);

  return new Agent({
    name: options.name,
    instructions: options.instructions,
    model: options.model,
    tools: options.tools,
  });
}
