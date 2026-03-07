/**
 * Base AI Agent Class (Cloudflare Durable Object)
 * * Provides the foundation for all AI agents built on Cloudflare Durable Objects.
 * Integrates directly with the OpenAI Agents SDK while routing all inference
 * through Cloudflare AI Gateway's Universal /compat endpoint.
 * * @module AI/Agents/Base
 */
import { Agent as CFAgent } from "agents";
import { resolveDefaultAiModel, resolveDefaultAiProvider, type SupportedProvider } from "@/ai/providers/config";
import { createUniversalGatewayClient } from "@/ai/utils/gateway-client";
import { Logger } from "@/lib/logger";
import type { z } from "zod";

/**
 * Standard state shape for any agent.
 * @property status - Current execution state of the agent.
 * @property history - Audit log of steps taken or messages exchanged.
 * @property lastResult - Cached output from the most recent run.
 */
export interface BaseAgentState {
  status: "idle" | "running" | "optimizing" | "paused" | "failed" | "completed" | string;
  history: Record<string, unknown>[]; 
  lastResult?: unknown;
}

/**
 * Interface for defining a reusable tool that an agent can invoke.
 */
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (args: Record<string, any>) => Promise<unknown>;
}

/**
 * Abstract class representing a modular agentic worker.
 * Inherits from Cloudflare's Durable Object `Agent` base.
 * * @template State - The shape of the persisted Durable Object state.
 */
export class BaseAgent<TEnv extends Env = Env, State = any> extends CFAgent<TEnv, State> {
  initialState: State = {
    status: "idle",
    history: []
  } as unknown as State;

  private _logger?: Logger;

  protected get logger(): Logger {
    return this._logger ?? new Logger(this.env, this.constructor.name);
  }

  protected set logger(value: Logger) {
    this._logger = value;
  }

  protected setStatus(status: any) {
    if ((this.state as any).status !== status) {
       this.logger.info(`Status changed: ${(this.state as any).status} -> ${status}`);
    }
    // @ts-ignore - setState is available dynamically on Durable Object state if implemented or we can write to state variables
    if (typeof this.setState === 'function') {
      (this.setState as (state: any) => Promise<void>)({
        ...this.state,
        status
      });
    } else {
      (this.state as any).status = status;
    }
  }

  /**
   * Resolves the primary AI provider for this agent run.
   * Defaults to the environment's configured provider.
   */
  protected resolveProvider(preferredProvider?: string | null): SupportedProvider {
    const configured = String(preferredProvider || "").trim();
    if (!configured) return resolveDefaultAiProvider(this.env);
    return configured as SupportedProvider;
  }

  /**
   * Resolves the model identifier for a specific provider.
   */
  protected resolveModel(provider: SupportedProvider, preferredModel?: string | null): string {
    const configured = String(preferredModel || "").trim();
    return configured || resolveDefaultAiModel(this.env, provider);
  }

  /**
   * Dynamically retrieves the correct API key based on the target provider.
   */
  protected async getProviderApiKey(provider: SupportedProvider): Promise<string> {
    try {
      switch (provider) {
        case 'anthropic':
          return await (this.env as any).ANTHROPIC_API_KEY?.get() || "cf-aig-dummy-key";
        case 'gemini':
        case 'google-ai-studio':
          return await (this.env as any).GEMINI_API_KEY?.get() || "cf-aig-dummy-key";
        case 'openai':
        default:
          return await (this.env as any).OPENAI_API_KEY?.get() || "cf-aig-dummy-key";
      }
    } catch {
      return "cf-aig-dummy-key"; // Fallback to dummy key if relying entirely on Gateway BYOK
    }
  }

  /**
   * Executes a plain-text prompt using the OpenAI Agents SDK.
   * * @param input - Agent name, instructions, and prompt.
   * @returns The final text output from the agent.
   */
  protected async runTextWithModel(input: {
    name: string;
    instructions: string;
    prompt: string;
    provider?: string | null;
    model?: string | null;
    tools?: unknown[];
  }): Promise<string> {
    const provider = this.resolveProvider(input.provider);
    const model = this.resolveModel(provider, input.model);
    const namespacedModel = model.includes('/') ? model : `${provider}/${model}`;
    
    // Dynamically import the heavy SDK only when execution begins
    const { Agent: OpenAIAgent, run } = await import("@openai/agents");
    
    const apiKey = await this.getProviderApiKey(provider);
    const client = await createUniversalGatewayClient(this.env, apiKey);
    
    const agent = new OpenAIAgent({
      name: input.name,
      model: namespacedModel,
      instructions: input.instructions,
      tools: input.tools as any,
    });

    try {
      // @ts-ignore - 'client' option exists in runtime but might be missing in strict types
      const result = await run(agent, input.prompt, { client });
      return String(result.finalOutput ?? "");
    } catch (error) {
      const _error = error as Error;
      this.logger.error(`[runTextWithModel] ${_error.message}`, { error: _error });
      throw _error;
    }
  }

  /**
   * Executes a prompt and returns a structured object matching a Zod schema.
   * Leverages the OpenAI Agents SDK's native schema enforcement.
   * * @param input - Agent name, instructions, prompt, and Zod schema.
   * @returns The parsed and validated object.
   */
  protected async runStructuredResponseWithModel<T = unknown>(input: {
    name: string;
    instructions: string;
    prompt: string;
    schema: z.ZodType<T>;
    tools?: unknown[];
    provider?: string | null;
    model?: string | null;
  }): Promise<T> {
    const provider = this.resolveProvider(input.provider);
    const model = this.resolveModel(provider, input.model);
    const namespacedModel = model.includes('/') ? model : `${provider}/${model}`;
    
    // Dynamically import the heavy SDK only when execution begins
    const { Agent: OpenAIAgent, run } = await import("@openai/agents");
    
    const apiKey = await this.getProviderApiKey(provider);
    const client = await createUniversalGatewayClient(this.env, apiKey);
    
    const agent = new OpenAIAgent({
      name: input.name,
      model: namespacedModel,
      instructions: input.instructions,
      outputType: input.schema as any,
      tools: input.tools as any,
    });
    
    try {
      // @ts-ignore - 'client' option exists in runtime but might be missing in strict types
      const result = await run(agent, input.prompt, { client });
      return result.finalOutput as T;
    } catch (error) {
      const _error = error as Error;
      this.logger.error(`[runStructuredResponseWithModel] ${_error.message}`, { error: _error });
      throw _error;
    }
  }
}