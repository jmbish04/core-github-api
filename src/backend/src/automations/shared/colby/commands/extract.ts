import type { ColbyCommandDefinition } from '../contracts';

export const ExtractCommand: ColbyCommandDefinition = {
  domain: 'push',
  name: 'extract',
  description: 'Extract the current review context into a digest.',
  async execute(_invocation, ctx) {
    return {
      type: 'reply',
      body: ctx.thread.isPullRequest
        ? `Captured the current review context for PR #${ctx.thread.number}. A deeper extraction workflow can now build on this thread.`
        : `Captured the current issue context for #${ctx.thread.number}.`,
    };
  },
};
