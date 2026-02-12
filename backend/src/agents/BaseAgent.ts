import { Agent as OpenAIAgent } from "@openai/agents";
import { Agent } from "agents";
import {
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
  type SupportedProvider,
} from "../lib/agent-ai";

export abstract class BaseAgent<TState = unknown> extends Agent<Env, TState> {
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
    const agent = new OpenAIAgent({
      name: input.name,
      model,
      instructions: input.instructions,
    });
    const result = await runner.run(agent, input.prompt);
    return String(result.finalOutput ?? "");
  }
}

