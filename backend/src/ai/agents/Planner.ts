import { Hono } from 'hono';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { z } from 'zod';
import { PlanningWorkstreamSchema } from '@/lib/schemas/jules';
import { derivePlanBreakdownFromMarkdown } from '@/services/planning/honi-babysitter';

export const { Agent, handler } = createAgent<Env>({
  name: 'planner',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  system: 'Create an implementation plan for the user goal. Return a concise, execution-ready plan.',
  binding: 'PLANNER',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'PlannerAgent',
    graphId: 'core-github-api-planner',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();
const breakdownRequestSchema = z.object({
  requestId: z.string(),
  workstream: PlanningWorkstreamSchema,
  markdown: z.string().min(1),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
});

app.get('/health', (c) => c.json({ status: 'ok', agent: 'PlannerAgent' }));
app.get('/docs', (c) => c.text('Planner Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'PlannerAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'PlannerAgent', version: '1.0.0' }, paths: {} }));
app.post('/breakdown', async (c) => {
  const payload = breakdownRequestSchema.parse(await c.req.json());
  const breakdown = await derivePlanBreakdownFromMarkdown(c.env, payload);
  return c.json({ success: true, breakdown });
});

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class PlannerAgent extends Agent {}
