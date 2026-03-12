import { Hono } from 'hono';
import { createAgent, tool } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import {
  collectDiscordResearchCorpus,
  DiscordResearchPayloadSchema,
  type DiscordResearchPayload,
} from '@/ai/agents/research/discord-shared';

type DiscordResearchWorkflowBinding = {
  create(input: { params: DiscordResearchPayload }): Promise<{ id: string }>;
};

const searchDiscordMessages = tool({
  name: 'search_discord_messages',
  description: 'Search accessible Discord guilds, channels, and thread messages for a topic or keyword.',
  input: DiscordResearchPayloadSchema,
  handler: async (input, ctx) => {
    const env = (ctx?.env || {}) as { DISCORD_TOKEN: string | { get(): Promise<string> } };
    const corpus = await collectDiscordResearchCorpus(env, input);
    return {
      query: corpus.query,
      scannedGuilds: corpus.scannedGuilds,
      scannedChannels: corpus.scannedChannels,
      scannedMessages: corpus.scannedMessages,
      matchedMessages: corpus.matches.length,
      matches: corpus.matches.slice(0, 25),
    };
  },
});

const runDiscordResearch = tool({
  name: 'run_discord_research',
  description: 'Trigger the Discord research workflow for deeper analysis and summarization.',
  input: DiscordResearchPayloadSchema,
  handler: async (input, ctx) => {
    const env = (ctx?.env || {}) as Record<string, unknown>;
    const workflowBinding = env.DISCORD_RESEARCH_WORKFLOW as DiscordResearchWorkflowBinding | undefined;

    if (!workflowBinding || typeof workflowBinding.create !== 'function') {
      throw new Error('DISCORD_RESEARCH_WORKFLOW binding is not configured');
    }

    const instance = await workflowBinding.create({ params: DiscordResearchPayloadSchema.parse(input) });
    return { workflowInstanceId: instance.id };
  },
});

export const { Agent, handler } = createAgent<Env>({
  name: 'discord-research',
  model: 'claude-sonnet-4-5',
  system: [
    'You are a Discord research assistant.',
    'Help users research Discord communities thoroughly and summarize findings clearly.',
    'Use the search tool for fast inspection and trigger the workflow when deeper analysis is required.',
  ].join(' '),
  binding: 'DISCORD_RESEARCH_AGENT',
  tools: [searchDiscordMessages, runDiscordResearch],
  memory: buildMaxAgentMemory({
    agentName: 'DiscordResearchAgent',
    semanticBinding: 'RESEARCH_INDEX',
    graphId: 'core-github-api-discord-research',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'DiscordResearchAgent' }));
app.get('/docs', (c) => c.text('Discord Research Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'DiscordResearchAgent' }));
app.get('/openapi.json', (c) =>
  c.json({
    openapi: '3.1.0',
    info: { title: 'DiscordResearchAgent', version: '1.0.0' },
    paths: {},
  }),
);

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class DiscordResearchAgent extends Agent {}
