import type { Logger } from '@/lib/logger';
import { resolveDefaultAiModel, resolveDefaultAiProvider, type SupportedProvider } from '@/ai/providers/config';
import { runStructuredResponseWithModelFallback, runTextWithModelFallback } from '@/ai/utils/gateway-client';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { AgentTool } from './types';

export function resolveAgentProvider(env: Env, preferredProvider?: string | null): SupportedProvider {
  const configured = String(preferredProvider || '').trim();
  if (!configured) {
    return resolveDefaultAiProvider(env);
  }
  return configured as SupportedProvider;
}

export function resolveAgentModel(
  env: Env,
  provider: SupportedProvider,
  preferredModel?: string | null,
): string {
  const configured = String(preferredModel || '').trim();
  return configured || resolveDefaultAiModel(env, provider);
}

function buildToolInstructions(tools?: AgentTool[]): string {
  if (!Array.isArray(tools) || tools.length === 0) {
    return '';
  }

  const lines = tools.map((tool, index) => {
    return [
      `${index + 1}. ${tool.name || `tool_${index + 1}`}`,
      `Description: ${tool.description || 'No description provided.'}`,
      `Parameters: ${JSON.stringify(tool.parameters || {}, null, 2)}`,
    ].join('\n');
  });

  return `\n\nAvailable tools (describe the intended call arguments in your response when relevant):\n${lines.join('\n\n')}`;
}

export async function runAgentText(input: {
  env: Env;
  logger?: Logger;
  name: string;
  instructions: string;
  prompt: string;
  provider?: string | null;
  model?: string | null;
  tools?: AgentTool[];
}): Promise<string> {
  const provider = resolveAgentProvider(input.env, input.provider);
  const model = resolveAgentModel(input.env, provider, input.model);

  input.logger?.info(`Running text model ${model} on ${provider}`);

  return runTextWithModelFallback(
    input.env,
    provider,
    model,
    `${input.instructions}${buildToolInstructions(input.tools)}`,
    input.prompt,
  );
}

export async function runAgentStructured<T = unknown>(input: {
  env: Env;
  logger?: Logger;
  name: string;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  tools?: AgentTool[];
  provider?: string | null;
  model?: string | null;
}): Promise<T> {
  const provider = resolveAgentProvider(input.env, input.provider);
  const model = resolveAgentModel(input.env, provider, input.model);
  const schemaJson = zodToJsonSchema(input.schema as any, `${input.name}_output`);

  input.logger?.info(`Running structured model ${model} on ${provider}`);

  const result = await runStructuredResponseWithModelFallback(
    input.env,
    provider,
    model,
    [
      input.instructions,
      buildToolInstructions(input.tools),
      'Return ONLY JSON matching this schema:',
      JSON.stringify(schemaJson, null, 2),
    ]
      .filter(Boolean)
      .join('\n\n'),
    input.prompt,
  );

  return input.schema.parse(result);
}
