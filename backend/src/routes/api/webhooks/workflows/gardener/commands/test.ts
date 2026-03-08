import { ISlashCommand, CommandResult } from './types';
import { Implementer } from '../agents/implementer';

export const TestCommand: ISlashCommand = {
  name: 'test',
  description: 'Generate tests for this PR.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    return new Implementer(ctx.env).generateTests(ctx);
  }
};
