import { Agent as OpenAIAgent } from "@openai/agents";
import { Agent as CFAgent } from "agents";
import {
  createGatewayClient,
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
  type SupportedProvider,
} from "@/ai/agent-sdk";

export class BaseAgent<State = any> extends CFAgent<Env, State> {
  protected resolveProvider(preferredProvider?: string | null): SupportedProvider {
    const configured = String(preferredProvider || "").trim();
    if (!configured) return resolveDefaultAiProvider(this.env);
    return configured as SupportedProvider;
  }

  protected resolveModel(provider: SupportedProvider, preferredModel?: string | null): string {
    const configured = String(preferredModel || "").trim();
    return configured || resolveDefaultAiModel(this.env, provider);
  }

  protected async runTextWithModel(input: {
    name: string;
    instructions: string;
    prompt: string;
    provider?: string | null;
    model?: string | null;
  }): Promise<string> {
    const provider = this.resolveProvider(input.provider);
    const model = this.resolveModel(provider, input.model);
    const runner = await createRunner(this.env, provider, model);
    const client = await createGatewayClient(this.env, model);
    const agent = new OpenAIAgent({
      name: input.name,
      model,
      instructions: input.instructions,
      mcpServers: {
        "cloudflare": {
            transport: {
                type: "stdio",
                command: "npx",
                args: ["@cloudflare/mcp-server-cloudflare", "--mcp-endpoint", (this.env as any).MCP_API_URL || "https://docs.mcp.cloudflare.com/mcp"]
            }
        }
      } as any // Cast to any to avoid strict type issues with the specific Agent SDK version
    });
    const result = await runner.run(agent, input.prompt);
    return String(result.finalOutput ?? "");
  }
}

