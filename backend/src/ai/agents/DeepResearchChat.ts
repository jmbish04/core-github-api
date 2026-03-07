/**
 * @file backend/src/ai/agents/DeepResearchChat.ts
 * @description Deep Research Chat Agent built on HonoBaseAgent for interactive, multi-turn AI assistance with deep research context.
 * @owner Agentic Research Team
 */

import { HonoBaseAgent, HonoBaseAgentState, BASE_RESPONSE_SCHEMA } from "./base/HonoBaseAgent";

export interface DeepResearchChatState extends HonoBaseAgentState {
  currentDataset?: any;
}

export class DeepResearchChatAgent extends HonoBaseAgent<Env, DeepResearchChatState> {
  protected get agentName(): string {
    return "DeepResearchChatAgent";
  }

  // Extend the default response schema if needed. Using base for now.
  protected get responseSchema() {
    return BASE_RESPONSE_SCHEMA;
  }

  protected async getSystemPromptBase(): Promise<string> {
    return `You are a Deep Research orchestrator and analytical assistant.

Your primary role is to help users initiate, explore, and analyze "Deep Research" workflows built on the Cloudflare Agents SDK.
You excel at discussing repository architecture, analyzing source code, setting up research goals, and evaluating findings across complex codebases.

When users interact with you, provide structured, thoughtful responses:
- Present architectural patterns and code clearly.
- Offer strategic insights and suggestions for deep dive analysis.
- Summarize key complexities or trade-offs succinctly.

Feel free to break down complicated research steps into highly readable explanations.
Always adhere to the specific response format constraints below.
`;
  }
}
