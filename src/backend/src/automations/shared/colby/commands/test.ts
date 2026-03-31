import type { ColbyCommandDefinition } from '../contracts';
import { runImplementationTests } from './implement';

export const TestCommand: ColbyCommandDefinition = {
  domain: 'push',
  name: 'test',
  description: 'Generate or suggest tests for the current context.',
  async execute(_invocation, ctx) {
    return runImplementationTests(ctx);
  },
};
