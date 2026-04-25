import type { ColbyCommandDefinition } from '../contracts';

export const TestCommand: ColbyCommandDefinition = {
  domain: 'push',
  name: 'test',
  description: 'Generate or suggest tests for the current context.',
  async execute(_invocation, _ctx) {
    return { type: 'reply', body: 'Test generation not yet implemented' };
  },
};
