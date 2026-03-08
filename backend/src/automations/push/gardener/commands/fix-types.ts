import { ISlashCommand, CommandResult } from './types';
import { WorkerTypeFixer } from '../fixers/worker-type-fixer';

export const FixTypesCommand: ISlashCommand = {
  name: 'fix-types',
  description: 'Remove manual @cloudflare/workers-types.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    const fixer = new WorkerTypeFixer();
    const result = await fixer.fixAll(ctx);
    return { type: 'reply', body: result };
  }
};
