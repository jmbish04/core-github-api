/**
 * Structured Chat Coordinator
 *
 * Manages stateful multi-turn chat sessions backed by AgentStateStore.
 * Does NOT instantiate AIProvider — receives it via dependency injection
 * from the calling Agent, keeping this file as a pure state coordinator.
 *
 * @module AI/providers/agent-support/structured-chat
 */
import type { AIProvider } from '@/ai/providers';
import type { AgentStateStore } from './state-store';
import type { StructuredChatResult, StructuredChatState } from './types';
import { normalizeBlocks, normalizeFollowupPrompts } from './utils';

export type { ContentBlock, StructuredChatResult, StructuredChatState } from './types';
export { BASE_RESPONSE_SCHEMA } from './types';

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
  ai: AIProvider;
  store: AgentStateStore<State>;
  agentName: string;
  systemPrompt: string;
  message: string;
  history?: unknown[];
  context?: unknown;
  source?: string;
  sessionId?: string;
  requestedModel?: string;
  responseSchema?: any;
  skills?: string[];
}): Promise<StructuredChatResult> {
  const { ai, store, agentName, systemPrompt, message, responseSchema } = options;
  await store.ready();
  await store.setStatus('running');

  const modelUsed = options.requestedModel || 'default';
  const prompt = buildChatPrompt(
    message,
    (options.history || []).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'),
    options.context,
    options.source,
  );

  let rawResult: unknown;
  try {
    rawResult = await ai.generateStructuredResponse(
      prompt,
      responseSchema as any,
      systemPrompt,
      { model: options.requestedModel, skills: options.skills },
    );
  } catch (error) {
    store.logger.warn(`${agentName} structured response failed; falling back to text`, { error });
    const text = await ai.generateText(prompt, systemPrompt, { model: options.requestedModel, skills: options.skills });
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
