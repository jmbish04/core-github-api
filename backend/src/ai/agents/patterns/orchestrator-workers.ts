import { z } from 'zod';
import { Logger } from '@/lib/logger';
import { runAgentStructured, runAgentText } from '@/ai/agents/support/inference';

const TaskSchema = z.object({
  id: z.string(),
  workerType: z.enum(['researcher', 'coder']),
  instruction: z.string(),
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema),
});

export type OrchestratorState = {
  plan?: z.infer<typeof PlanSchema>;
  results: Record<string, string>;
};

export interface WorkerTask {
  workerId: string;
  input: unknown;
  priority?: number;
}

export abstract class OrchestratorWorkersAgent {
  protected readonly logger: Logger;
  protected state: OrchestratorState = { results: {} };

  constructor(protected readonly env: Env, loggerNamespace = 'patterns/orchestrator-workers') {
    this.logger = new Logger(env, loggerNamespace);
  }

  protected get plannerInstructions(): string {
    return 'Break the user request into smaller, distinct tasks assigned to either a researcher or coder worker.';
  }

  protected getWorkerInstructions(workerType: 'researcher' | 'coder'): string {
    if (workerType === 'researcher') {
      return 'You are a research assistant. Find information, inspect context, and summarize findings clearly.';
    }
    return 'You are a software engineer. Produce code, patches, or implementation guidance for the assigned task.';
  }

  async processRequest(objective: string): Promise<Record<string, string>> {
    const plan = await runAgentStructured({
      env: this.env,
      logger: this.logger,
      name: `${this.constructor.name}-planner`,
      instructions: this.plannerInstructions,
      prompt: objective,
      schema: PlanSchema,
    });

    this.state = { plan, results: {} };

    const entries = await Promise.all(
      plan.tasks.map(async (task) => {
        const result = await runAgentText({
          env: this.env,
          logger: this.logger,
          name: `${this.constructor.name}-${task.workerType}`,
          instructions: [
            `Worker type: ${task.workerType}`,
            `Original objective: ${objective}`,
            this.getWorkerInstructions(task.workerType),
          ].join('\n\n'),
          prompt: task.instruction,
        });
        return [task.id, result] as const;
      }),
    );

    const results = Object.fromEntries(entries);
    this.state = { plan, results };
    return results;
  }
}
