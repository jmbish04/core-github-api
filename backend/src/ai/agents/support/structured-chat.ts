import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { resolveDefaultAiModel, resolveDefaultAiProvider } from '@/ai/providers/config';
import { runStructuredResponseWithModelFallback } from '@/ai/utils/gateway-client';
import type { AgentStateStore } from './state-store';
import { runAgentText } from './inference';
import type { ContentBlock, StructuredChatResult, StructuredChatState } from './types';
import { BASE_RESPONSE_SCHEMA } from './types';

export type { ContentBlock, StructuredChatResult, StructuredChatState } from './types';
export { BASE_RESPONSE_SCHEMA } from './types';

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return !!value && typeof value === 'object' && 'safeParse' in (value as Record<string, unknown>);
}

function normalizeBlocks(value: unknown): ContentBlock[] {
  const parsed = BASE_RESPONSE_SCHEMA.safeParse(value);
  if (parsed.success) {
    return parsed.data.blocks;
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ type: 'text', text: value.trim() }];
  }

  if (value && typeof value === 'object' && Array.isArray((value as { blocks?: unknown[] }).blocks)) {
    return ((value as { blocks: ContentBlock[] }).blocks || []).filter(Boolean);
  }

  return [];
}

function normalizeFollowupPrompts(value: unknown): string[] {
  if (value && typeof value === 'object' && Array.isArray((value as { followupPrompts?: unknown[] }).followupPrompts)) {
    return ((value as { followupPrompts: unknown[] }).followupPrompts || [])
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, 5);
  }

  return [];
}

export function buildChatPrompt(
  message: string,
  history: Array<Record<string, unknown>>,
  context?: unknown,
  source?: string,
): string {
  const serializedHistory = history.length > 0 ? JSON.stringify(history.slice(-10), null, 2) : '[]';
  const serializedContext = context ? JSON.stringify(context, null, 2) : '{}';

  return [
    `Source: ${source || 'api'}`,
    `Context: ${serializedContext}`,
    `Recent history: ${serializedHistory}`,
    'User message:',
    message,
  ].join('\n\n');
}

export async function runStructuredChat<State extends StructuredChatState>(options: {
  env: Env;
  store: AgentStateStore<State>;
  agentName: string;
  systemPrompt: string;
  message: string;
  history?: unknown[];
  context?: unknown;
  source?: string;
  sessionId?: string;
  requestedModel?: string;
  responseSchema?: z.ZodTypeAny | Record<string, unknown>;
}): Promise<StructuredChatResult> {
  const { env, store, agentName, systemPrompt, message } = options;
  await store.ready();
  await store.setStatus('running');

  const provider = resolveDefaultAiProvider(env);
  const modelUsed = options.requestedModel || resolveDefaultAiModel(env, provider);
  const prompt = buildChatPrompt(
    message,
    (options.history || []).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'),
    options.context,
    options.source,
  );

  const responseSchema = options.responseSchema || BASE_RESPONSE_SCHEMA;
  const responseSchemaJson = isZodSchema(responseSchema)
    ? zodToJsonSchema(responseSchema as any, `${agentName}_chat_output`)
    : responseSchema;

  let rawResult: unknown;
  try {
    rawResult = await runStructuredResponseWithModelFallback(
      env,
      provider,
      modelUsed,
      [
        systemPrompt,
        'Return JSON matching this schema exactly:',
        JSON.stringify(responseSchemaJson, null, 2),
      ].join('\n\n'),
      prompt,
    );
  } catch (error) {
    store.logger.warn(`${agentName} structured response failed; falling back to text`, { error });
    const text = await runAgentText({
      env,
      logger: store.logger,
      name: agentName,
      instructions: systemPrompt,
      prompt,
      provider,
      model: modelUsed,
    });
    rawResult = {
      blocks: [{ type: 'text', text }],
      followupPrompts: [],
    };
  }

  const blocks = normalizeBlocks(rawResult);
  const followupPrompts = normalizeFollowupPrompts(rawResult);
  const response =
    blocks
      .map((block) => block.text)
      .filter((text) => text.trim().length > 0)
      .join('\n\n') ||
    (typeof rawResult === 'string' ? rawResult : '');

  await store.set({
    ...store.state,
    status: 'completed',
    lastResult: rawResult,
    repoContext: (options.context as Record<string, unknown> | null) || (store.state.repoContext ?? null),
    mcpCache: store.state.mcpCache || {},
    history: [
      ...(Array.isArray(store.state.history) ? store.state.history : []),
      { role: 'user', content: message, source: options.source || 'api', sessionId: options.sessionId || 'default' },
      { role: 'assistant', content: response, sessionId: options.sessionId || 'default', modelUsed },
    ],
  } as State);

  return {
    response,
    blocks,
    followupPrompts,
    sessionId: options.sessionId || 'default',
    modelUsed,
  };
}
