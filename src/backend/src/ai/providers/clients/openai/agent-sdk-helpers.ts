/**
 * @file ai/providers/clients/openai/agent-sdk-helpers.ts
 * @description Helpers for the @openai/agents SDK, routed through Cloudflare AI Gateway.
 *
 * Extracted from the old agent.ts to keep concerns separate:
 *  - agent.ts  → Vercel AI SDK generateObject() path (Agent class + run())
 *  - here      → @openai/agents SDK path (setDefaultOpenAIClient / createOpenAIAgent)
 */

import { OpenAI } from 'openai';
import { Agent } from '@openai/agents';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import { AIGateway } from '@/ai/providers/ai-gateway';
import { SupportedProvider } from '@/ai/providers/ai-gateway/config';
import { Logger } from '@/lib/logger';

export interface OpenAIAgentOptions {
  name: string;
  instructions: string;
  model?: string;
  tools?: any[];
}

/**
 * Creates an OpenAI client wired to AI Gateway in compat mode and
 * sets it as the default client for the @openai/agents SDK.
 */
export async function setupOpenAIAgentClient(
  env: Env,
  provider: SupportedProvider | 'cloudflare' | 'google',
): Promise<OpenAI> {
  const logger = new Logger(env, 'OpenAIAgentClient');
  const logPrefix = "[OpenAIAgentClient - setupOpenAIAgentClient] ";
  logger.info(`${logPrefix} Setting up OpenAI client for provider: ${provider}`);
  const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, {
    provider,
    endpoint: 'chat',
    openai_compatible: true,
  });

  logger.info(`${logPrefix} Base URL: ${baseUrl}`);
  
  

  const resolvedKey = apiKey || aigToken || 'dummy-key';

  const openai = new OpenAI({
    baseURL: AIGateway.formatBaseUrlForClient(baseUrl, 'openai_agents_sdk'),
    apiKey: resolvedKey,
    // When using AI Gateway BYOK with the OpenAI SDK, the gateway token in `apiKey` 
    // constructs the Authorization: Bearer <token> header which the gateway natively handles.
    // cf-aig-authorization is appended for completeness in case of multiple token scenarios.
    defaultHeaders: aigToken 
      ? { 'cf-aig-authorization': `Bearer ${aigToken}` }
      : undefined,
  });

  setDefaultOpenAIClient(openai);
  return openai;
}

/**
 * Creates a fully configured @openai/agents `Agent`, routed through AI Gateway.
 */
export async function createOpenAIAgent(
  env: Env,
  provider: SupportedProvider | 'cloudflare' | 'google',
  options: OpenAIAgentOptions,
): Promise<Agent> {
  await setupOpenAIAgentClient(env, provider);
  const logger = new Logger(env, 'OpenAIAgentClient');
  const logPrefix = "[OpenAIAgentClient - createOpenAIAgent] ";
  logger.info(`${logPrefix} Creating OpenAI agent for provider: ${provider}`);
  const newAgentPayload = {
    name: options.name,
    instructions: options.instructions,
    model: options.model,
    tools: options.tools,
  };
  logger.info(`${logPrefix} New agent payload: ${JSON.stringify(newAgentPayload)}`);

  return new Agent({
    name: options.name,
    instructions: options.instructions,
    model: options.model,
    tools: options.tools,
  });
}
