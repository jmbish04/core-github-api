import { createUniversalGatewayRunner } from '@/ai/utils/gateway-client';
import { resolveDefaultAiProvider } from '@/ai/providers/config';
import { z } from 'zod';

export type AgentInputItem = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface CompatToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  execute?: (args: unknown) => Promise<unknown>;
}

export interface CompatAgentConfig<TOutput = unknown> {
  name: string;
  instructions?: string;
  model?: string;
  provider?: string;
  env?: Env;
  tools?: CompatToolDefinition[];
  outputType?: z.ZodType<TOutput>;
  toolUseBehavior?: string;
}

export class Agent<TOutput = unknown> {
  constructor(public readonly config: CompatAgentConfig<TOutput>) {}
}

export function tool(config: {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  execute?: (args: unknown) => Promise<unknown>;
}): CompatToolDefinition {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
  };
}

async function getApiKey(env: Env, provider?: string): Promise<string> {
  const resolvedProvider = provider || resolveDefaultAiProvider(env);
  try {
    if (resolvedProvider.includes('anthropic')) {
      return await (env as any).ANTHROPIC_API_KEY?.get?.() || 'cf-aig-dummy-key';
    }
    if (resolvedProvider.includes('gemini') || resolvedProvider.includes('google')) {
      return (
        (await (env as any).GOOGLE_AI_API_KEY?.get?.()) ||
        (await (env as any).GEMINI_API_KEY?.get?.()) ||
        'cf-aig-dummy-key'
      );
    }
    return await (env as any).OPENAI_API_KEY?.get?.() || 'cf-aig-dummy-key';
  } catch {
    return 'cf-aig-dummy-key';
  }
}

export async function run<TOutput = unknown>(
  agent: Agent<TOutput>,
  input: string | AgentInputItem[],
): Promise<{ finalOutput: TOutput | string; history: AgentInputItem[] }> {
  const env = agent.config.env;
  if (!env) {
    throw new Error(`Agent ${agent.config.name} is missing env for execution.`);
  }

  const apiKey = await getApiKey(env, agent.config.provider);
  const runner = await createUniversalGatewayRunner(env, apiKey, agent.config.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  const result = await runner.run(agent, input);

  return {
    finalOutput: result.finalOutput as TOutput | string,
    history: result.history as AgentInputItem[],
  };
}

export async function withTrace<T>(_name: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function toHoniTools(_tools: CompatToolDefinition[] | undefined) {
  return [];
}
