import { ContainerManager } from '@/automations/push/operations';
import type { ColbyCommandDefinition } from '../contracts';

export const FixAllCommand: ColbyCommandDefinition = {
  domain: 'push',
  name: 'fix-all',
  description: 'Launch a full repository audit and fix run in the container supervisor.',
  async execute(_invocation, ctx) {
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
