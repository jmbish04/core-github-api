import { ISlashCommand, CommandResult } from './types';
import { Implementer } from '../agents/implementer';

export const TestCommand: ISlashCommand = {
  name: 'test',
  description: 'Generate tests for this PR.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Implementer({} as any, ctx.env).generateTests(ctx);
  }
};
