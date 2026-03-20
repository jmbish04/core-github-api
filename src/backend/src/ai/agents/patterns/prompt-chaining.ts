import { Logger } from '@/lib/logger';
import { runAgentText } from '@/ai/agents/support/inference';

export type PromptChainingStep = Record<string, never>;

export abstract class PromptChainingAgent {
  protected maxTurns = 3;
  protected readonly logger: Logger;

  constructor(protected readonly env: Env, loggerNamespace = 'patterns/prompt-chaining') {
    this.logger = new Logger(env, loggerNamespace);
  }

  protected abstract checkQuality(content: string): Promise<{ passes: boolean; feedback: string[] }>;

  async execute(input: string, instructions = 'You are a helpful assistant.'): Promise<{ content: string; quality: { passes: boolean; feedback: string[] } }> {
    let content = await runAgentText({
      env: this.env,
      logger: this.logger,
      name: this.constructor.name,
      instructions,
      prompt: input,
    });

    let quality = await this.checkQuality(content);
    let turns = 0;

    while (!quality.passes && turns < this.maxTurns) {
      content = await runAgentText({
        env: this.env,
        logger: this.logger,
        name: this.constructor.name,
        instructions,
        prompt: [
          `Original request: ${input}`,
          `Previous attempt: ${content}`,
          `Critique: ${quality.feedback.join('\n')}`,
          'Improve the response based on the critique.',
        ].join('\n\n'),
      });

      quality = await this.checkQuality(content);
      turns += 1;
    }

    return { content, quality };
  }
}
