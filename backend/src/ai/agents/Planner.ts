import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';

const PlanSchema = z.object({
  title: z.string().describe("The comprehensive title of the plan"),
  steps: z.array(
    z.object({
      id: z.string().describe("Unique identifier for the step (e.g., step-1)"),
      description: z.string().describe("Detailed description of what needs to be done"),
      difficulty: z.enum(["easy", "medium", "hard"]).describe("Estimated difficulty level"),
      command: z.string().optional().describe("CLI command provided if applicable"),
    }),
  ),
});

const _agentExports = createAgent({
  name: "planner",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  system: "Create an implementation plan for the user goal. Return a concise, execution-ready plan.",
  binding: "PLANNER",
  tools: [],
  memory: {
     working: true
  } as any,
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true } as any
});
const handler = _agentExports;
const Agent = _agentExports.DurableObject as any;

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'PlannerAgent' }));
app.get('/docs', (c) => c.text('Planner Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'PlannerAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'PlannerAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw as any, c.env, c.executionCtx as any));

export default app;
export class PlannerAgent extends Agent {}
