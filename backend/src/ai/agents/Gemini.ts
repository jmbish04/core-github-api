import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';

export const agentExports = createAgent({
  name: "gemini",
  model: "google-ai-studio/gemini-2.5-flash",
  system: "You are an elite autonomous agent powered by Cloudflare AI Gateway. Provide structured, highly accurate responses.",
  binding: "GEMINI_AGENT",
  tools: [],
  memory: {
     episodic: { enabled: true, dbBinding: 'DB' }
  },
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true }
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'GeminiAgent' }));
app.get('/docs', (c) => c.text('Gemini Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'GeminiAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'GeminiAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => agentExports.fetch(c.req.raw, c.env, c.executionCtx));

export default app;

const AgentDurableObject = agentExports.DurableObject as any;

export class GeminiAgent extends AgentDurableObject {}