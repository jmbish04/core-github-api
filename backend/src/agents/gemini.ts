import { callable } from "agents";
import { Agent as OpenAIAgent, type AgentInputItem } from "@openai/agents";
import toolsApi from "../tools/index";
import { resolveDefaultAiModel, resolveDefaultAiProvider } from "../lib/agent-ai";
import { BaseAgent, BaseAgentState } from "@agent-sdk";
import { Logger } from "@logging";

const SYSTEM_PROMPT = `
You are a helpful GitHub assistant.
You can help users create repositories, triage PR comments, and explain Cloudflare worker behavior.
Respond with concise, actionable answers.
`;

export class GeminiAgent extends BaseAgent<Env, BaseAgentState> {
  protected logger: Logger;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.logger = new Logger(env, "GeminiAgent");
  }

  @callable()
  healthProbe() {
    return {
      status: "ok",
      agent: "GeminiAgent",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Main chat entrypoint
   */
  async chat(userMessage: string, history: any[] = []) {
    try {
      this.logger.info("Chat request", { messageLength: userMessage.length, historyLength: history.length });

      const provider = resolveDefaultAiProvider(this.env);
      const model = resolveDefaultAiModel(this.env, provider);
      
      const agent = new OpenAIAgent({
        name: "GeminiAgent",
        model,
        instructions: SYSTEM_PROMPT,
      });

      const historyText = history
        .map((msg) => `${msg.role === "assistant" || msg.role === "model" ? "assistant" : "user"}: ${msg.content}`)
        .join("\n");

      const input = historyText
        ? `${historyText}\nuser: ${userMessage}`
        : userMessage;

      const result = await this.runAgent(agent, input);
      const response = String(result.finalOutput ?? "");
      const nextHistory = [...history, { role: "user", content: userMessage }, { role: "assistant", content: response }];
      
      return { response, history: nextHistory };
    } catch (error: any) {
      this.logger.error("Chat failed", { error: error.message });
      return { response: `Error: ${error.message}`, history };
    }
  }

  /**
   * Execute tool by calling internal API routes.
   * Retained for compatibility with callers that may still use tool delegation.
   */
  async executeTool(name: string, args: any): Promise<any> {
    const { WORKER_API_KEY } = this.env as any;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": WORKER_API_KEY || "",
    };

    let url = "";
    let method = "POST";
    let body = JSON.stringify(args);

    switch (name) {
      case "create_repo":
        url = "/github/repos/create";
        break;
      case "retrofit_workflows":
        url = "/github/repos/retrofit";
        break;
      case "list_pr_comments": {
        method = "GET";
        const q = new URLSearchParams({
          owner: args.owner,
          repo: args.repo,
          number: args.number.toString(),
        });
        url = `/prs/comments/list?${q.toString()}`;
        body = undefined as any;
        break;
      }
      case "create_pr_comment":
        url = "/prs/comments/create";
        break;
      case "save_comments_kv":
        url = "/kv/comments/save";
        break;
      case "get_comments_kv": {
        method = "GET";
        const qKv = new URLSearchParams({ key: args.key });
        url = `/kv/comments/get?${qKv.toString()}`;
        body = undefined as any;
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const req = new Request(`http://localhost${url}`, {
      method,
      headers,
      body,
    });

    const res = await toolsApi.fetch(req, this.env, this.ctx as any);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Tool request failed: ${res.status} ${txt}`);
    }
    return await res.json();
  }
}
