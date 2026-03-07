/**
 * Base Task Assignee Agent
 * 
 * Provides a base class for specialized task executor agents.
 * Handles model resolution and agent initialization in the constructor.
 * 
 * @module AI/Agents/Base/TaskAssignee
 */
import { BaseAgent } from "@/ai/agents/base/BaseAgent";
import { getAgentModel } from "@/ai/providers/config";
import { Logger } from "@logging";

export interface AgentConfig {
  instructions?: string;
  moduleName?: string;
}

/**
 * Abstract base class for specialized task execution agents.
 */
export abstract class BaseTaskAssignee extends BaseAgent<Env> {
  protected config: AgentConfig;


  constructor(state: any, env: Env, config: AgentConfig = {}) {
    super(state, env);
    this.config = config;
    (this as any).logger = new Logger(env, `task-assignee/${config.moduleName || 'base'}`);
  }

/**
 * Abstract execute method to be implemented by specialized task assignees.
 */
  abstract execute(input: any): Promise<any>;

/**
 * Standardized task execution wrapper.
 */
  protected async runTask(input: string) {
    this.logger.debug(`Running agent task with input size: ${input.length}`);
    const start = Date.now();
    
    const result = await this.runTextWithModel({
      name: this.config.moduleName || "TaskAssignee",
      instructions: this.config.instructions || "You are a specialized task executor.",
      prompt: input,
    });
    
    const duration = Date.now() - start;
    this.logger.info(`Agent task completed in ${duration}ms`, { outputSize: JSON.stringify(result).length });
    return { data: result }; 
  }
}
