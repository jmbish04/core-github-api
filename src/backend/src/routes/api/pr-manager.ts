import { Hono } from 'hono';
import { getAgentByName } from 'agents';

export const app = new Hono<{ Bindings: Env }>();

app.get('/jobs', async (c) => {
  const agent = await getAgentByName(c.env.PR_MANAGER_AGENT as any, 'singleton');
  return agent.fetch(new Request('http://do/api/jobs'));
});

export default app;
