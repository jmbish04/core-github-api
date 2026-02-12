/**
 * AI SDK Orchestration Module
 * * Provides the BaseAgent class and factory functions to bridge 
 * Cloudflare Durable Objects with the OpenAI Agents SDK via AI Gateway.
 * * Verified: 2026-02-08 | Target: Cloudflare Workers / OpenAI Agents SDK
 */

import { OpenAI } from 'openai';
import { 
  Agent as OpenAIAgent, 
  run, 
  type AgentInputItem, 
  withTrace, 
  RunResult, 
  type AgentOutputType, 
  setDefaultOpenAIClient,
  setOpenAIAPI
} from "@openai/agents";
import { Agent as CFAgent, callable } from "agents";
import { 
  getAgentModel, 
  getAiGatewayBaseUrl, 
  getCompatModelName,
  
  type GatewayUseCase
} from "./ai-config";
import { z } from "zod";

/**
 * Standard state shape for any agent.
 */
export interface BaseAgentState {
  status: "idle" | "running" | "optimizing" | "paused" | "failed" | "completed" | string;
  history: any[]; 
  lastResult?: any;
}

/**
 * Standard Tool interface for Agents
 */
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (args: any) => Promise<any>;
}

/**
 * Creates a scoped OpenAI client configured for the AI Gateway.
 * Returns the client instance to be injected into run(), avoiding global state race conditions.
 */
import { BudgetTracker } from "@budget";

/**
 * Creates a scoped OpenAI client configured for the AI Gateway.
 * Returns the client instance to be injected into run(), avoiding global state race conditions.
 */
export async function createGatewayClient(
  env: Env, 
  modelSlug: string, 
  debugTag?: string,
  tracking?: { sessionId?: string; documentId?: string; workflowName?: string }
): Promise<OpenAI> {
  const isNativeOpenAI = modelSlug.startsWith('openai/');
  const useCase: GatewayUseCase = isNativeOpenAI ? 'openai_sdk' : 'openai_agents_sdk';
  
  const baseUrl = await getAiGatewayBaseUrl(env, modelSlug, useCase);
  const budgetTracker = new BudgetTracker(env);

  // 1. HARD STOP: Check budget before creating client
  // If budget exceeded, this throws and halts execution immediately.
  await budgetTracker.checkBudgetStrict();

  /**
   * FIX: Workers AI defaults to a very low max_tokens, truncating long responses.
   * The SDK sees finish_reason: "length" and loops until maxTurns is exceeded.
   * @openai/agents v0.4.6 has no model_settings support, so we inject via fetch wrapper.
   */
  const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
    let bodyObj: any = {};
    
    if (init?.body && typeof init.body === 'string') {
      try {
        bodyObj = JSON.parse(init.body);
        if (!bodyObj.max_tokens) {
          bodyObj.max_tokens = 4096;
        }
        if (bodyObj.temperature === undefined) {
          bodyObj.temperature = 0.1;
        }
        init = { ...init, body: JSON.stringify(bodyObj) };
      } catch {}
    }
    
    const response = await globalThis.fetch(input, init);

    // 2. USAGE TRACKING (Fire-and-forget-ish)
    // We clone response to read usage without consuming original stream body if needed, 
    // but typically OpenAI returns usage in the JSON body.
    // For streaming, usage handles are trickier. Assuming non-streaming for Agents SDK default.
    // Actually, Agents SDK uses standard completions, often non-streaming for tools.
    // Let's try to peek at the cloned response.
    const clone = response.clone();
    clone.json().then((data: any) => {
        if (data?.usage) {
            budgetTracker.trackUsage({
                model: modelSlug,
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0,
                sessionId: tracking?.sessionId,
                documentId: tracking?.documentId,
                workflowName: tracking?.workflowName
            }).catch(e => console.error("[BudgetTracker] Background logging failed", e));
        }
    }).catch(() => { /* ignore json parse errors on clone */ });

    return response;
  };

  // LOGGING: Explicitly stated model usage as requested
  const useOpenAI = false; // Default to Workers AI (USE_OPENAI_MODELS not in Env)
  const tag = debugTag ? ` \x1b[1;37m[${debugTag}]\x1b[0m` : '';
  const logMsg = useOpenAI 
    ? `\x1b[1;32m🟢 [AI-CONFIG] USING OPENAI MODELS (Reliability Mode)${tag}\x1b[0m` 
    : `\x1b[1;33m🟠 [AI-CONFIG] USING WORKER-AI MODELS (Falback/Cost Mode)${tag}\x1b[0m`;
  console.log(logMsg);

  // Get AI Gateway token from Secrets Store
  const apiToken = await env.AI_GATEWAY_TOKEN.get();

  return new OpenAI({ 
    baseURL: baseUrl, 
    apiKey: apiToken || "",
    dangerouslyAllowBrowser: true,
    fetch: wrappedFetch,
  });
}

// --- The Base Class ---

/**
 * The Mother Base Class (Forensic Agent Core).
 * Wraps Cloudflare Durable Object lifecycle with OpenAI Agent capabilities.
 */
export abstract class BaseAgent<
  TEnv extends Cloudflare.Env = Cloudflare.Env,
  State extends BaseAgentState = BaseAgentState
> extends CFAgent<TEnv, State> {
  
  initialState: State = {
    status: "idle",
    history: []
  } as unknown as State;

  protected setStatus(status: State["status"]) {
    console.log(`[${this.constructor.name}] Status: ${status}`);
    this.setState({
      ...this.state,
      status
    });
  }

  /**
   * CORE METHOD: Runs an OpenAI Agent within the Cloudflare context.
   * Dynamically syncs the Gateway before execution and prefixes model names.
   */

  protected async runAgent(
    agent: OpenAIAgent,
    input: string | AgentInputItem[],
    context?: string,
    maxTurns: number = 3
  ): Promise<RunResult<any, any>> {
    const traceTitle = `Run ${agent.name}`;
    
    // Extract sessionId from state if available
    // We assume state.history might contain session context or we can add it to BaseAgentState
    // Fallback to 'unknown-session' if not present in state (requiring subclasses to populate it if needed)
    const sessionId = (this.state as any).sessionId || 'unknown-session';

    return await withTrace(traceTitle, async () => {
      // 1. Prepare Input
      let inputItems: AgentInputItem[] = typeof input === 'string' 
        ? [{ role: "user", content: input }] 
        : input;

      if (context) {
        inputItems = [{ role: "system", content: context }, ...inputItems];
      }

      console.log(`[${this.constructor.name}] 🤖 Executing ${agent.name} (maxTurns=${maxTurns})...`);
      
      try {
        // 2. Resolve model and sync Gateway
        const rawModel = typeof agent.model === 'string' ? agent.model : getAgentModel('default', this.env);
        
        // CRITICAL FIX: Ensure the model name uses the workers-ai/ prefix for compat endpoints
        let compatModel = getCompatModelName(rawModel);
        
        // Update agent instance to use compat name for the OpenAI API call
        (agent as any).model = compatModel;

        const client = await createGatewayClient(this.env as unknown as Env, rawModel, agent.name, {
            sessionId: sessionId,
            workflowName: this.constructor.name
        });
        
        // 3. Execute with turn limit
        // @ts-ignore - 'client' option exists in runtime but might be missing in strict types
        const result = await run(agent, inputItems, { maxTurns, client });
        return result;
      } catch (error) {
        console.error(`[${this.constructor.name}] 💥 Execution Error:`, error);
        this.setStatus("failed");
        throw error;
      }
    });
  }

  /**
   * PATTERN: Evaluator-Optimizer Loop.
   */
  protected async runOptimizationLoop(
    input: string,
    config: {
      generator: OpenAIAgent;
      evaluator: OpenAIAgent;
      maxAttempts?: number;
    }
  ): Promise<string> {
    const { generator, evaluator, maxAttempts = 3 } = config;
    let attempts = 0;
    let currentInput: AgentInputItem[] = [{ role: "user", content: input }];

    this.setStatus("optimizing");

    while (attempts < maxAttempts) {
      const genResult = await this.runAgent(generator, currentInput);
      const content = genResult.finalOutput;
      
      if (!content) throw new Error("Generator produced no output");

      const evalResult = await this.runAgent(evaluator, [
        { role: "user", content: `Original Request: ${input}\n\nGenerated Content: ${content}` }
      ]);
      
      const judgment = evalResult.finalOutput as any;
      const passed = judgment?.score === "pass" || judgment?.status === "approved";

      this.setState({
        ...this.state,
        history: [
          ...this.state.history,
          { attempt: attempts + 1, content, feedback: judgment?.feedback, passed }
        ]
      });

      if (passed) {
        this.setStatus("completed");
        return content as string;
      }

      console.log(`[${this.constructor.name}] ↺ Loop ${attempts + 1} failed. Feedback: ${judgment?.feedback}`);
      
      currentInput = [
        ...genResult.history,
        { role: "user", content: `Feedback: ${judgment?.feedback}. Please improve your previous response.` }
      ];
      attempts++;
    }

    this.setStatus("failed");
    return "Max optimization attempts reached.";
  }
}

/**
 * Interface for standalone Gateway Agents.
 */
export interface GatewayAgentInterface<Output extends AgentOutputType> {
  agent: OpenAIAgent<unknown, Output>;
  run(input: string, context?: string): Promise<{ data: any }>;
}

/**
 * Factory: Creates a standalone agent with built-in auto-fallback.
 */
export async function createGatewayAgent<Output extends AgentOutputType = any>(
  env: Cloudflare.Env, 
  model: string, 
  systemPrompt: string, 
  outputSchema?: Output,
  tracking?: { sessionId?: string; documentId?: string; workflowName?: string }
): Promise<GatewayAgentInterface<Output>> {

  // Initialize the agent — model will be overridden to compat name before run
  const agent = new OpenAIAgent({
    name: "GatewayAgent",
    model: model,
    instructions: systemPrompt,
    outputType: outputSchema || ("text" as any),
  });

  return {
    agent,
    run: async (input: string, context?: string) => {
      const inputItems: AgentInputItem[] = context 
        ? [{ role: "system", content: context }, { role: "user", content: input }]
        : [{ role: "user", content: input }];

      // 1. Create scoped client (injects wrappedFetch with max_tokens:4096 + temperature:0.1)
      const client = await createGatewayClient(env as unknown as Env, model, "GatewayAgent", tracking);

      // 2. Fix compat model name — @cf/ models need workers-ai/ prefix for /compat endpoint
      const compatModel = getCompatModelName(model);
      (agent as any).model = compatModel;

      try {
        // @ts-ignore - client injection
        const result = await run(agent, inputItems, { client });
        return { data: result.finalOutput };
      } catch (error: any) {
        console.warn(`[GatewayAgent] Primary failed (${compatModel}).`, error);
        console.debug(error.stack);
        console.warn(`[GatewayAgent] Switching to Fallback.`);

        // Fallback: same gateway sync pattern
        const fallbackModel = getAgentModel('fallback', env as unknown as Env);
        const fallbackClient = await createGatewayClient(env as unknown as Env, fallbackModel, "GatewayAgent-Fallback", tracking);

        const fallbackCompatModel = getCompatModelName(fallbackModel);
        const fallbackAgent = new OpenAIAgent({
            name: "GatewayAgent-Fallback",
            model: fallbackCompatModel,
            instructions: systemPrompt,
            outputType: outputSchema || ("text" as any),
        });

        // @ts-ignore - client injection
        const result = await run(fallbackAgent, inputItems, { client: fallbackClient });
        return { data: result.finalOutput };
      }
    }
  };
}


export { OpenAIAgent, OpenAIAgent as Agent, callable, withTrace, z };