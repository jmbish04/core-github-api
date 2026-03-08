import { run, Agent } from '@openai/agents';
const agent = new Agent({ model: 'openai/gpt-4' });
run(agent, 'hi', { client: { dummy: true } });
