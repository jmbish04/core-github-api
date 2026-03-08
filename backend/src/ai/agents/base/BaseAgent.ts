/**
 * Base AI Agent Class (Cloudflare Durable Object)
 * Refactored to use Honi V2 (honidev) API
 * @module AI/Agents/Base
 */
import { DurableObject } from "cloudflare:workers";
import { resolveDefaultAiModel, resolveDefaultAiProvider, type SupportedProvider } from "@/ai/providers/config";
import { createUniversalGatewayClient } from "@/ai/utils/gateway-client";
import { Logger } from "@/lib/logger";
import type { z } from "zod";

export interface BaseAgentState {
  status: "idle" | "running" | "optimizing" | "paused" | "failed" | "completed" | string;
  history: Record<string, unknown>[]; 
  lastResult?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (args: Record<string, any>) => Promise<unknown>;
}

export class BaseAgent<TEnv extends Env = Env, State = any> extends DurableObject<TEnv> {
  // @ts-expect-error - DurableObject provides these but TS doesn't see them automatically in some envs
  public env: TEnv;
  // @ts-expect-error
  public ctx: DurableObjectState;

  public state: State = {
    status: "idle",
    history: []
  } as unknown as State;

  constructor(ctx: DurableObjectState, env: TEnv) {
    super(ctx, env);
    this.env = env;
    this.ctx = ctx;
  }
  
  initialState: State = this.state;

  private _logger?: Logger;

  protected get logger(): Logger {
    return this._logger ?? new Logger(this.env, this.constructor.name);
  }

  protected set logger(value: Logger) {
    this._logger = value;
  }

  protected async setStatus(status: string) {
    if ((this.state as Record<string, unknown>).status !== status) {
       this.logger.info(`Status changed: ${(this.state as Record<string, unknown>).status} -> ${status}`);
    }
    // we assume the subclass might implement setState
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (this as any).setState === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this as any).setState({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(this as any).state,
        status
      });
    } else {
      (this.state as Record<string, unknown>).status = status;
    }
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

  protected async getProviderApiKey(provider: SupportedProvider): Promise<string> {
    try {
      switch (provider) {
        case 'anthropic':
          return await (this.env as Record<string, { get?: () => Promise<string> }>).ANTHROPIC_API_KEY?.get() || "cf-aig-dummy-key";
        case 'gemini':
        case 'google-ai-studio':
          return await (this.env as Record<string, { get?: () => Promise<string> }>).GEMINI_API_KEY?.get() || "cf-aig-dummy-key";
        case 'openai':
        default:
          return await (this.env as Record<string, { get?: () => Promise<string> }>).OPENAI_API_KEY?.get() || "cf-aig-dummy-key";
      }
    } catch {
      return "cf-aig-dummy-key";
    }
  }

  protected async runTextWithModel(input: {
    name: string;
    instructions: string;
    prompt: string;
    provider?: string | null;
    model?: string | null;
    tools?: unknown[];
  }): Promise<string> {
    const provider = this.resolveProvider(input.provider);
    const apiKey = await this.getProviderApiKey(provider);
    
    // Raw fallback via Workers API or Gateway
    this.logger.info(`Running text model ${input.model} on ${provider}`);
    const res = await super.fetch(new Request("http://agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.prompt })
    }));
    const data = await res.json() as Record<string, string>;
    return data.reply || data.response || "";
  }

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
    const apiKey = await this.getProviderApiKey(provider);
    
    this.logger.info(`Running structured model ${input.model} on ${provider}`);
    const res = await super.fetch(new Request("http://agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
           message: `${input.instructions}\n\nTask: ${input.prompt}\n\nPlease strictly respect the schema requirements and return ONLY JSON.` 
        })
    }));
    const data = await res.json() as Record<string, string>;
    const result = data.reply || data.response || "{}";
    
    try {
       const jsonString = result.replace(/```json\\n/g, "").replace(/```/g, "").trim();
       return JSON.parse(jsonString);
    } catch(e) {
       this.logger.error(`Failed to parse structured output: ${result}`);
       throw e;
    }
  }
}