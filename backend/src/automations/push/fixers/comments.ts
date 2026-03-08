import { ContainerManager } from '../ops/container';
import type { CommandResult, ISlashCommand } from './worker_types';

export const ResolveCommentsCommand: ISlashCommand = {
  name: 'resolve-comments',
  aliases: ['resolve-conflicts'],
  description: 'Attempt automated comment or merge-conflict resolution for the current PR.',
  async handle(_args, ctx, metadata): Promise<CommandResult | null> {
    try {
      await new ContainerManager(ctx.env).executeTask(ctx, 'resolve-conflicts', {
        pr: metadata.issueNumber,
      });
      return {
        type: 'reply',
        body: '⚔️ **Colby Container**: Attempting automated resolution now.',
      };
    } catch (error: unknown) {
      return {
        type: 'reply',
        body: `❌ **Container Error**: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
