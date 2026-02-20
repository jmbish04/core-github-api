import { Agent as OpenAIAgent } from "@openai/agents";
import { Agent as CFAgent } from "agents";
import {
  createGatewayClient,
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
  type SupportedProvider,
} from "@/ai/agent-sdk";
import { Logger } from "@/lib/logger";
import { z } from "zod";

export class BaseAgent<State = any> extends CFAgent<Env, State> {
  private _logger?: Logger;

  protected get logger(): Logger {
    return this._logger ?? new Logger(this.env, this.constructor.name);
  }

  protected set logger(value: Logger) {
    this._logger = value;
  }

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

  protected async runStructuredResponseWithModel<T = any>(input: {
    name: string;
    instructions: string;
    prompt: string;
    schema: z.ZodType<T>;
    provider?: string | null;
    model?: string | null;
  }): Promise<T> {
    const provider = this.resolveProvider(input.provider);
    const model = this.resolveModel(provider, input.model);
    const runner = await createRunner(this.env, provider, model);
    const client = await createGatewayClient(this.env, model);
    
    // We must pass the schema to the agent configuration
    const agent = new OpenAIAgent({
      name: input.name,
      model,
      instructions: input.instructions,
      outputType: input.schema as any, // Cast to any to avoid strict type issues with specific SDK versions
      mcpServers: {
        "cloudflare": {
            transport: {
                type: "stdio",
                command: "npx",
                args: ["@cloudflare/mcp-server-cloudflare", "--mcp-endpoint", (this.env as any).MCP_API_URL || "https://docs.mcp.cloudflare.com/mcp"]
            }
        }
      } as any
    });
    
    try {
      const result = await runner.run(agent, input.prompt);
      return result.finalOutput as T;
    } catch (error: any) {
      this.logger.error(`[runStructuredResponseWithModel] ${error.message}`, { error });
      throw error;
    }
  }
}

