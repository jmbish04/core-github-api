import { runImplementationTests } from './implement';
import type { CommandResult, ISlashCommand } from '../fixers/types';

export const TestCommand: ISlashCommand = {
  name: 'test',
  description: 'Generate tests for this PR.',
  async handle(_args, ctx): Promise<CommandResult | null> {
    return runImplementationTests(ctx);
  }
};
