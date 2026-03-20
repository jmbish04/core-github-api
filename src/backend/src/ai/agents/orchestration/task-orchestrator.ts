import { Logger } from '@/lib/logger';
import { runAgentText } from '@/ai/agents/support/inference';

export interface TaskOrchestratorConfig {
  instructions?: string;
  moduleName?: string;
}

export abstract class BaseTaskOrchestrator {
  protected readonly logger: Logger;
  protected config: TaskOrchestratorConfig;

  constructor(protected readonly env: Env, config: TaskOrchestratorConfig = {}) {
    this.config = config;
    this.logger = new Logger(env, `task-orchestrator/${config.moduleName || 'base'}`);
  }

  abstract execute(input: unknown): Promise<unknown>;

  protected async runTask(input: string): Promise<{ data: string }> {
    this.logger.debug(`Running task orchestration with input size ${input.length}`);
    const start = Date.now();

    const result = await runAgentText({
      env: this.env,
      logger: this.logger,
      name: this.config.moduleName || 'TaskOrchestrator',
      instructions: this.config.instructions || 'You are a specialized task executor.',
      prompt: input,
    });

    const duration = Date.now() - start;
    this.logger.info(`Task orchestration completed in ${duration}ms`, { outputSize: result.length });

    return { data: result };
  }
}
