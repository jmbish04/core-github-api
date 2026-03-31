import { Hono } from 'hono';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { buildSkillContext } from '@services/octokit/skill-fetcher';

export const { Agent, handler } = createAgent<Env>({
  name: 'deep-reasoning',
  model: 'google-ai-studio/gemini-2.5-flash',
  system: async (ctx: { env: Env }) => {
    const skills = await buildSkillContext(ctx.env as any, 'DeepReasoningAgent');
    return `You are a deep technical reasoning assistant. Return only output that matches the requested JSON schema.${skills}`;
  },
  binding: 'DEEP_REASONING_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'DeepReasoningAgent',
    graphId: 'core-github-api-deep-reasoning',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'DeepReasoningAgent' }));
app.get('/docs', (c) => c.text('DeepReasoning Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'DeepReasoningAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'DeepReasoningAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class DeepReasoningAgent extends Agent {}
