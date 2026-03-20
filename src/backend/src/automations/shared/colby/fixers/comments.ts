import { ContainerManager } from '@/automations/push/operations';
import type { ColbyCommandDefinition } from '../contracts';

export const ResolveCommentsCommand: ColbyCommandDefinition = {
  domain: 'push',
  name: 'resolve-comments',
  aliases: ['resolve-conflicts'],
  description: 'Attempt automated review-comment or merge-conflict resolution for the current PR.',
  requiresPr: true,
  async execute(_invocation, ctx) {
    try {
      await new ContainerManager(ctx.env).executeTask(ctx, 'resolve-conflicts', {
        pr: ctx.thread.number,
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
