import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';

export const { Agent, handler } = createAgent<Env>({
  name: "deep-reasoning",
  model: "google-ai-studio/gemini-2.5-flash",
  system: "You are a deep technical reasoning assistant. Return only output that matches the requested JSON schema.",
  binding: "DEEP_REASONING_AGENT",
  tools: [],
  memory: {
     working: true
  },
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true }
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'DeepReasoningAgent' }));
app.get('/docs', (c) => c.text('DeepReasoning Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'DeepReasoningAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'DeepReasoningAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class DeepReasoningAgent extends Agent {}