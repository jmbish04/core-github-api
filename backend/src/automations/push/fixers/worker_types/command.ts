import type { CommandResult, ISlashCommand } from './contracts';
import { WorkerTypesFixer } from './fixer';

export const FixTypesCommand: ISlashCommand = {
  name: 'fix-types',
  description: 'Remove manual @cloudflare/workers-types imports.',
  async handle(_args, ctx): Promise<CommandResult | null> {
    const fixer = new WorkerTypesFixer();
    const result = await fixer.fixAll(ctx);
    return { type: 'reply', body: result };
  },
};
