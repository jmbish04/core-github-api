import { callable } from "agents";
// import { Agent as OpenAIAgent } from "@openai/agents";
import { resolveDefaultAiModel, resolveDefaultAiProvider, type SupportedProvider } from "../lib/agent-ai";
import { BaseAgent, BaseAgentState, OpenAIAgent } from "@agent-sdk";
import { Logger } from "@logging";

interface DeepReasoningInput {
  prompt: string;
  schema: object;
  provider?: SupportedProvider;
  reasoningParams?: {
    effort?: "low" | "medium" | "high";
    summary?: "auto" | "concise" | "detailed";
  };
}

export class DeepReasoningAgent extends BaseAgent<Env, BaseAgentState> {
  protected logger: Logger;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.logger = new Logger(env, "DeepReasoningAgent");
  }

  @callable()
  healthProbe() {
    return {
      status: "ok",
      agent: "DeepReasoningAgent",
      timestamp: new Date().toISOString(),
    };
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health-probe") {
      return Response.json(this.healthProbe());
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const input = (await request.json()) as DeepReasoningInput;
      const defaultProvider = resolveDefaultAiProvider(this.env);
      const { prompt, schema, provider = defaultProvider } = input;
      
      // DEBUG: Check environment keys
      const hasAiGateway = !!await this.env.AI_GATEWAY_TOKEN?.get();
      const hasCfToken = !!await this.env.CLOUDFLARE_API_TOKEN?.get();
      const hasOpenAi = !!await this.env.OPENAI_API_KEY?.get(); // If it were an env var
      console.log(`[DeepReasoning] Keys present: AI_GATEWAY=${hasAiGateway}, CF_TOKEN=${hasCfToken}, OPENAI_ENV=${hasOpenAi}`);
      
      if (!prompt || !schema) {
        return new Response("Missing prompt or schema", { status: 400 });
      }

      this.logger.info("Executing deep reasoning", { promptLength: prompt.length, provider });

      const model = resolveDefaultAiModel(this.env, provider);

      // Resolve API Key (support cleartext or Secret)
      // let apiKey = await this.env.OPENAI_API_KEY?.get();
      
      const agent = new OpenAIAgent({
        name: "DeepReasoningAgent",
        model,
        // apiKey, // should be configured on the @agents-sdk.ts
        outputType: schema as any,
        instructions:
          "You are a deep technical reasoning assistant. Return only output that matches the requested JSON schema.",
      } as any);

      const result = await this.runAgent(agent, prompt);
      return Response.json(result.finalOutput ?? {});
    } catch (error: any) {
      this.logger.error("Deep reasoning failed", { error: error.message });
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}
