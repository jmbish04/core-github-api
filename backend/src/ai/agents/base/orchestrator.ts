/**
 * Base Orchestrator Agent
 * 
 * Provides a base class for orchestrator agents that plan and delegate tasks.
 * Extends `BaseAgent` and adds support for lazy agent initialization and 
 * standardized execution logging.
 * 
 * @module AI/Agents/Base/Orchestrator
 */
import { BaseAgent } from "@/ai/agents/base/BaseAgent";
import { getAgentModel } from "@/ai/providers/config";
import { ResearchLogger } from "@research-logger";
import { Logger } from "@/lib/logger";

export interface AgentConfig {
  instructions?: string;
  moduleName?: string; // Optional override
}

/**
 * Abstract base class for orchestration-style agents.
 */
export abstract class BaseOrchestrator extends BaseAgent<Env> {
  protected config: AgentConfig = {};

  constructor(state: DurableObjectState, env: Env) {
      super(state, env);
    (this as any).logger = new Logger(env, `orchestrator/base`); // Default logger
  }

/**
 * Initializes the underlying OpenAI Agent instance.
 * Resolves the model based on the provided module name.
 */
  protected initAgent(config: AgentConfig = {}) {
     this.config = config;
     (this as any).logger = new Logger(this.env, `orchestrator/${config.moduleName || 'base'}`);
  }

/**
 * Abstract plan method to be implemented by specialized orchestrators.
 */
  abstract plan(input: string): Promise<any>;

/**
 * Standardized execution wrapper for the orchestrator agent.
 */
  protected async runOrchestration(input: string) {
    if (!this.config.moduleName && !this.config.instructions) {
         this.initAgent();
    }
    this.logger.debug(`Running agent with input: ${input.slice(0, 100)}...`);
    const start = Date.now();
    
    const result = await this.runTextWithModel({
      name: this.config.moduleName || "Orchestrator",
      instructions: this.config.instructions || "You are a senior orchestrator responsible for planning and delegating tasks.",
      prompt: input,
    });
    
    const duration = Date.now() - start;
    this.logger.info(`Agent execution completed in ${duration}ms`, { inputSize: input.length });
    return result;
  }
}

