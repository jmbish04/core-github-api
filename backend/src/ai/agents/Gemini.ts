/**
 * Gemini Agent (Google ADK Integration)
 * 
 * A Durable Object Agent that leverages the Google Autonomous Development Kit (ADK).
 * Implements a "hijack" strategy by routing ADK's native inference calls 
 * through the Cloudflare AI Gateway to use Workers AI or other providers.
 * 
 * @module AI/Agents/Gemini
 */
import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@/ai/agents/base/BaseAgent";

type GeminiMessage = { role: string; content: string };

interface GeminiState extends BaseAgentState {
  status: "idle" | "running" | "error";
  messages: GeminiMessage[];
}

export class GeminiAgent extends BaseAgent<Env, GeminiState> {
  initialState: GeminiState = {
    status: "idle",
    messages: [],
    history: [], // BaseAgentState requires history
  };

  private doId: string;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doId = state.id.toString();
  }

/**
 * Executes a stateful chat session using OpenAI Agents SDK mapped via AI Gateway.
 * 
 * @param prompt - The user's input message.
 * @param history - Optional message history.
  * @returns The agent's response and updated history.
  */
  @callable()
  async chat(prompt: string, history?: GeminiMessage[], customInstructions?: string) {
    try {
      await this.setState({ ...this.state, status: "running" });
      const priorMessages = history ?? this.state.messages;

      const fullResponse = await this.runTextWithModel({
        provider: "gemini",
        model: "google-ai-studio/gemini-2.5-flash",
        name: "cf_gateway_agent",
        instructions: customInstructions || "You are an elite autonomous agent powered by Cloudflare AI Gateway. Provide structured, highly accurate responses.",
        prompt: prompt,
      });

      // Persist the state durably
      await this.setState({
        ...this.state,
        messages: [
          ...priorMessages,
          { role: "user", content: prompt },
          { role: "assistant", content: fullResponse }
        ],
        status: "idle"
      });

      return { response: fullResponse };

    } catch (error: unknown) {
      await this.setState({ ...this.state, status: "error" });
      return { response: `[Agent Error]: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
