import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';
import type { BaseAgentState } from './BaseAgent';

export type HonoBaseAgentState = BaseAgentState;
export const BASE_RESPONSE_SCHEMA = z.unknown();
export type ContentBlock = unknown;
export type HonoChatResult = unknown;

export const agentExports = createAgent({
  name: "hono-base",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  system: "You are an extensible Hono-based agent.",
  binding: "HONO_BASE_AGENT",
  tools: [],
  memory: {
     working: true
  } as any,
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true } as any
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'HonoBaseAgent' }));
app.get('/docs', (c) => c.text('HonoBase Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'HonoBaseAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'HonoBaseAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => agentExports.fetch(c.req.raw as any, c.env, c.executionCtx as any));

export default app;

const AgentDurableObject = agentExports.DurableObject as any;

export class HonoBaseAgent extends AgentDurableObject {
    public env: Env;
    public ctx: DurableObjectState;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
    }
}
