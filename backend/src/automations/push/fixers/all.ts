import { ContainerManager } from '../ops/container';
import type { CommandResult, ISlashCommand } from './types';

export const FixAllCommand: ISlashCommand = {
  name: 'fix-all',
  description: 'Full repository audit and fix.',
  async handle(_args, ctx): Promise<CommandResult | null> {
    try {
      await new ContainerManager(ctx.env).executeTask(ctx, 'fix-all', {});
      return {
        type: 'reply',
        body: '🚜 **Colby Container**: Starting a full repository fix. I will report back shortly.',
      };
    } catch (error: unknown) {
      return {
        type: 'reply',
        body: `❌ **Container Error**: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
