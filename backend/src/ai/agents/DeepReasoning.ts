import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';

const _agentExports = createAgent({
  name: "deep-reasoning",
  model: "google-ai-studio/gemini-2.5-flash",
  system: "You are a deep technical reasoning assistant. Return only output that matches the requested JSON schema.",
  binding: "DEEP_REASONING_AGENT",
  tools: [],
  memory: {
     working: true
  } as any,
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true } as any
});
const handler = _agentExports;
const Agent = _agentExports.DurableObject as any;

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'DeepReasoningAgent' }));
app.get('/docs', (c) => c.text('DeepReasoning Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'DeepReasoningAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'DeepReasoningAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw as any, c.env, c.executionCtx as any));

export default app;
export class DeepReasoningAgent extends Agent {}