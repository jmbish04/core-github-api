import {
  runStructuredChat,
  BASE_RESPONSE_SCHEMA,
  type StructuredChatResult,
} from '@/ai/providers';
import type { AIProvider, AgentStateStore } from '@/ai/providers';

type DeepResearchChatDeps = {
  env: Env;
  ai: AIProvider;
  store: AgentStateStore<any>;
};

export async function deepResearchChat(
  deps: DeepResearchChatDeps,
  message: string,
  history: unknown[] = [],
  context?: unknown,
  source = 'api',
  sessionId = 'default',
  requestedModel?: string,
): Promise<StructuredChatResult> {

  const systemPrompt = `You are a Deep Research orchestrator and analytical assistant.

Your primary role is to help users initiate, explore, and analyze deep research workflows built on the Cloudflare Agents SDK stack.
You excel at discussing repository architecture, analyzing source code, setting up research goals, and evaluating findings across complex codebases.

When users interact with you, provide structured, thoughtful responses:
- Present architectural patterns and code clearly.
- Offer strategic insights and suggestions for deep dive analysis.
- Summarize key complexities or trade-offs succinctly.

Feel free to break down complicated research steps into highly readable explanations.
Always adhere to the specific response format constraints below.`;

  return runStructuredChat({
    ai: deps.ai,
    store: deps.store,
    agentName: 'ResearchAgent/DeepResearchChat',
    systemPrompt,
    message,
    history,
    context,
    source,
    sessionId,
    requestedModel,
    responseSchema: BASE_RESPONSE_SCHEMA,
    skills: ['deep-research', 'brainstorming', 'source-evaluation'],
  });
}
