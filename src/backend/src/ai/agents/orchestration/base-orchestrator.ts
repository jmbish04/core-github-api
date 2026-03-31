import { Logger } from '@/lib/logger';
import { runAgentText } from '@/ai/agents/support/inference';

export interface AgentConfig {
  instructions?: string;
  moduleName?: string;
}

export abstract class BaseOrchestrator {
  protected readonly logger: Logger;
  protected config: AgentConfig = {};

  constructor(protected readonly env: Env, loggerNamespace = 'orchestration/base') {
    this.logger = new Logger(env, loggerNamespace);
  }

  protected initAgent(config: AgentConfig = {}): void {
    this.config = config;
  }

  abstract plan(input: string): Promise<unknown>;

  protected async runOrchestration(input: string): Promise<string> {
    if (!this.config.moduleName && !this.config.instructions) {
      this.initAgent();
    }

    this.logger.debug(`Running orchestration for: ${input.slice(0, 100)}...`);
    const start = Date.now();

    const result = await runAgentText({
      env: this.env,
      logger: this.logger,
      name: this.config.moduleName || 'Orchestrator',
      instructions: this.config.instructions || 'You are a senior orchestrator responsible for planning and delegating tasks.',
      prompt: input,
    });

    const duration = Date.now() - start;
    this.logger.info(`Agent execution completed in ${duration}ms`, { inputSize: input.length });
    return result;
  }
}
