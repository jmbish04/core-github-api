import { z } from 'zod';
import { Logger } from '@/lib/logger';
import { runAgentStructured, runAgentText } from '@/ai/agents/support/inference';

const EvaluationSchema = z.object({
  feedback: z.string(),
  score: z.enum(['pass', 'fail']),
});

export interface EvaluatorOptimizerInput {
  initialPrompt: string;
  maxIterations?: number;
}

export type EvaluatorState = {
  history: {
    iteration: number;
    content: string;
    feedback: string;
    score: 'pass' | 'fail';
  }[];
  finalResult?: string;
  status: string;
};

export abstract class EvaluatorOptimizerAgent {
  protected readonly logger: Logger;
  protected state: EvaluatorState = { history: [], status: 'idle' };

  constructor(protected readonly env: Env, loggerNamespace = 'patterns/evaluator-optimizer') {
    this.logger = new Logger(env, loggerNamespace);
  }

  protected get generatorInstructions(): string {
    return 'You are a helpful assistant. Improve your previous response based on evaluator feedback.';
  }

  protected get evaluatorInstructions(): string {
    return 'Evaluate the content for accuracy, completeness, and clarity. Return whether it passes and actionable feedback.';
  }

  async execute(input: string | EvaluatorOptimizerInput): Promise<string> {
    const normalized = typeof input === 'string' ? { initialPrompt: input } : input;
    const maxIterations = normalized.maxIterations ?? 3;
    let currentPrompt = normalized.initialPrompt;

    this.state = { history: [], status: 'running' };

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const content = await runAgentText({
        env: this.env,
        logger: this.logger,
        name: `${this.constructor.name}-generator`,
        instructions: this.generatorInstructions,
        prompt: currentPrompt,
      });

      const judgment = await runAgentStructured({
        env: this.env,
        logger: this.logger,
        name: `${this.constructor.name}-evaluator`,
        instructions: this.evaluatorInstructions,
        prompt: `Original request:\n${normalized.initialPrompt}\n\nGenerated content:\n${content}`,
        schema: EvaluationSchema,
      });

      const history = [
        ...this.state.history,
        { iteration, content, feedback: judgment.feedback, score: judgment.score },
      ];

      this.state = {
        history,
        finalResult: content,
        status: judgment.score === 'pass' ? 'completed' : 'optimizing',
      };

      if (judgment.score === 'pass') {
        return content;
      }

      currentPrompt = [
        `Original request: ${normalized.initialPrompt}`,
        `Previous attempt: ${content}`,
        `Evaluator feedback: ${judgment.feedback}`,
        'Revise the answer and fix the issues called out by the evaluator.',
      ].join('\n\n');
    }

    this.state.status = 'failed';
    return this.state.finalResult || 'Max iterations reached without passing evaluation.';
  }
}
