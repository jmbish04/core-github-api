import { Logger } from '@/lib/logger';
import { runAgentText } from '@/ai/agents/support/inference';

export interface ParallelInput {
  tasks: unknown[];
  concurrencyLimit?: number;
}

export class ParallelAgent {
  protected readonly logger: Logger;

  constructor(protected readonly env: Env, loggerNamespace = 'patterns/parallelization') {
    this.logger = new Logger(env, loggerNamespace);
  }

  async debate(topic: string): Promise<{ pro: string; con: string; verdict: string }> {
    const [pro, con] = await Promise.all([
      runAgentText({
        env: this.env,
        logger: this.logger,
        name: 'ParallelAgent-pro',
        instructions: 'Give arguments in favor of the topic. Be concrete and concise.',
        prompt: topic,
      }),
      runAgentText({
        env: this.env,
        logger: this.logger,
        name: 'ParallelAgent-con',
        instructions: 'Give arguments against the topic. Be concrete and concise.',
        prompt: topic,
      }),
    ]);

    const verdict = await runAgentText({
      env: this.env,
      logger: this.logger,
      name: 'ParallelAgent-synthesizer',
      instructions: 'Synthesize both sides into a balanced conclusion and final recommendation.',
      prompt: [`Topic: ${topic}`, `Arguments in favor:\n${pro}`, `Arguments against:\n${con}`].join('\n\n'),
    });

    return { pro, con, verdict };
  }
}
