import { ISlashCommand, CommandResult } from './types';
import { ContainerManager } from '../ops/container-manager';

export const ResolveConflictsCommand: ISlashCommand = {
  name: 'resolve-conflicts',
  description: 'Attempt automatic conflict resolution for a PR.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    try {
      await new ContainerManager(ctx.env).executeTask(ctx, 'resolve-conflicts', {
          pr: metadata.issueNumber
      });
      return { type: 'reply', body: "⚔️ **Colby Container**: Attempting conflict resolution..." };
    } catch (e: unknown) {
      return { type: 'reply', body: `❌ **Container Error**: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
};
