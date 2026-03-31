import { resolveDefaultAiProvider } from '@/ai/providers/ai-gateway/config';
import { generateStructuredWithTools, generateTextWithTools } from '@/ai/providers';
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


export async function run<TOutput = unknown>(
  agent: Agent<TOutput>,
  input: string | AgentInputItem[],
): Promise<{ finalOutput: TOutput | string; history: AgentInputItem[] }> {
  const env = agent.config.env;
  if (!env) {
    throw new Error(`Agent ${agent.config.name} is missing env for execution.`);
  }

  const prompt = Array.isArray(input) 
    ? input.map(i => `${i.role.toUpperCase()}: ${i.content}`).join('\n\n')
    : input;

  const tools = toHoniTools(agent.config.tools);

  if (agent.config.outputType) {
    const result = await generateStructuredWithTools(
      env,
      prompt,
      agent.config.outputType,
      tools,
      agent.config.instructions,
      { model: agent.config.model },
      agent.config.provider as any
    );
    return {
      finalOutput: result.data,
      history: Array.isArray(input) ? input : [{ role: 'user', content: prompt }]
    };
  } else {
    const result = await generateTextWithTools(
      env,
      prompt,
      tools,
      agent.config.instructions,
      { model: agent.config.model },
      agent.config.provider as any
    );
    return {
      finalOutput: result.text,
      history: Array.isArray(input) ? input : [{ role: 'user', content: prompt }]
    };
  }
}

export async function withTrace<T>(_name: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function toHoniTools(_tools: CompatToolDefinition[] | undefined) {
  return [];
}
