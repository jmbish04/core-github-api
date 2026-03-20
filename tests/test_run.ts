import { createAgent } from '@/ai/agents/honi';

const runtime = createAgent<Env>({
  name: 'test-agent',
  model: 'claude-3-5-sonnet-latest',
  system: 'Compile-time test agent.',
  tools: [],
});

void runtime;
