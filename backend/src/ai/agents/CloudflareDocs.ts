/**
 * @file backend/src/ai/agents/CloudflareDocs.ts
 * @description Agent for querying Cloudflare Documentation with GitHub context.
 * @owner Cloudflare Docs Integration Team
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@/ai/agent-sdk";
import { Agent } from "@openai/agents";
import { getAgentModelName } from "@/ai/utils/model-config";
import { queryMCP } from "@/ai/mcp/mcp-client";

interface CloudflareDocsState extends BaseAgentState {
  repoContext: {
    owner: string;
    repo: string;
  } | null;
}

export class CloudflareDocsAgent extends BaseAgent<Env, CloudflareDocsState> {
  protected agent!: Agent;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  initialState: CloudflareDocsState = {
    repoContext: null,
    status: "idle",
    history: [],
  };

  async onStart(): Promise<void> {
    this.logger.info("CloudflareDocsAgent initialized");

    const searchCloudflareDocsTool = {
      type: 'function' as const,
      name: "search_cloudflare_documentation",
      description: "Search the Cloudflare documentation for specific products, features, or error codes. Returns semantic chunks.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "The search query (e.g., 'how to configure D1 bindings', 'workers size limit', 'error 1001')."
          }
        },
        required: ["query"],
        additionalProperties: false
      },
      strict: true,
      isEnabled: async () => true,
      needsApproval: async () => false,
      invoke: async (context: any, input: string) => {
        try {
          const args = JSON.parse(input);
          return await queryMCP(args.query, "CloudflareDocsAgent");
        } catch (error: any) {
          return JSON.stringify({ error: `MCP Query failed: ${error.message}` });
        }
      }
    };

    this.agent = new Agent({
      name: "CloudflareDocsAgent",
      model: getAgentModelName('GeminiAgent'), // Use a strong model for reasoning
      instructions: `You are an expert Cloudflare Support Engineer and Systems Architect.
      
Your goal is to answer user questions about Cloudflare products by searching the official documentation.
You also have context about the user's current GitHub repository, which you should use to tailor your answers (e.g., suggesting specific config changes for their project structure).

GUIDELINES:
1. ALWAYS use the 'search_cloudflare_documentation' tool to verify facts. Do not hallucinate Cloudflare limits or APIs.
2. If the user asks about their specific code, use the repository context provided in the system prompt to infer the likely setup (e.g., "Since you are using Hono...").
3. Provide concrete code examples (wrangler.jsonc, TypeScript) whenever possible.
4. Be concise but helpful.

Using the Tool:
- Search for keywords, not full sentences.
- If the first search is vague, refine the query and search again.
`,
      tools: [searchCloudflareDocsTool],
    });
  }

  @callable()
  async chat(message: string, history: Array<{ role: string; content: string }>, repoContext?: { owner: string; repo: string }): Promise<{ response: string }> {
    this.logger.info("Received chat request", { message, repoContext });

    // Update state with new context if provided
    if (repoContext) {
      await this.setState({ ...this.state, repoContext });
    }

    // augment instructions with repo context
    let instructions = this.agent.instructions;
    if (this.state.repoContext) {
      instructions += `\n\nCURRENT REPOSITORY CONTEXT:\nOwner: ${this.state.repoContext.owner}\nRepo: ${this.state.repoContext.repo}\nConsider this context when answering topics about deployment, environment variables, or framework usage.`;
    }

    // Temporary override instructions for this run (if Agent SDK supported it, but we can just rely on the tool finding relevant info)
    // Actually, @openai/agents doesn't easily support per-run instructions override without recreating the agent or passing it in 'run'.
    // We will prepend the context to the message for the model to see.
    
    let fullMessage = message;
    if (this.state.repoContext) {
      fullMessage = `[Context: Working on ${this.state.repoContext.owner}/${this.state.repoContext.repo}]\n${message}`;
    }

    // Re-map history roles for the Agent SDK if needed, but BaseAgent.runAgent handles the underlying call
    // We need to pass the history to the agent? BaseAgent.runAgent logic:
    // It creates a new runner. 
    // We want to maintain conversation history. 
    // The 'history' passed in is likely just for the UI. The Agent SDK 'Agent' is stateless per request unless we manage threads.
    // For now, we will just pass the current message and rely on the UI sending history if the underlying SDK supported it, 
    // but typically we pass previous messages as a chat history array to the model.
    // BaseAgent.runAgent implementation (from memory) uses `agent.run({ messages: ... })`.
    
    // Let's look at BaseAgent.ts or assume standard behavior. 
    // Since we can't see BaseAgent source right now, we'll assume we can pass messages.
    // But `this.runAgent` signature usually takes `(agent, input, ...)`
    
    /**
     * Using `this.runAgent(this.agent, fullMessage)` 
     */
    
    // We might want to include the history in the LLM context.
    // The current `ResearchAgent` example just passed `messageText`.
    // We will do the same for now to keep it simple, or improved:
    // If the Agent SDK supports history, we'd use it. 
    // Since we are inside a DO, we could keep history in `this.state.history`.
    // But the `chat` method receives `history` from the caller (API).
    // Let's construct a prompt with history if needed, or just send the last message if the agent is "stateless" in terms of LLM context window managed by the client.
    // The `chat.ts` route logic suggests it fetches history from DB and passes it to `chat()`.
    
    // We will construct the messages array for the agent run.
    const messages = [
        { role: 'system', content: instructions },
        ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.content })),
        { role: 'user', content: fullMessage }
    ];

    // We can't easily pass the full interactions array to `this.runAgent` if it only accepts a string input.
    // However, if `this.runAgent` calls `agent.run()`, `agent.run()` usually takes `{ messages }`.
    // Let's try to pass the messages array if the type allows, or just the string.
    // Given `ResearchAgent` uses `this.runAgent(this.agent, messageText)`, it implies a string.
    // We will stick to the string for Safe Mode, implying the Agent might not see full history unless we concatenate it.
    // Concatenation is safer if we are unsure of the SDK internals.
    
    const conversation = history.map(h => `${h.role === 'model' ? 'Assistant' : 'User'}: ${h.content}`).join('\n');
    const enrichedInput = `${conversation}\nUser: ${fullMessage}`;

    const result = await this.runAgent(this.agent, enrichedInput);
    return { response: String(result.finalOutput) };
  }
}
