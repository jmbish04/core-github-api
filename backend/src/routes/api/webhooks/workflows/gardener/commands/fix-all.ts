import { ISlashCommand, CommandResult } from './types';
import { ContainerManager } from '../ops/container-manager';

export const FixAllCommand: ISlashCommand = {
  name: 'fix-all',
  description: 'Full repo audit & fix.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    try {
      await new ContainerManager(ctx.env).executeTask(ctx, 'fix-all', {});
      return { type: 'reply', body: "🚜 **Colby Container**: Starting full fix... I will report back shortly." };
    } catch (e: unknown) {
      return { type: 'reply', body: `❌ **Container Error**: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
};
