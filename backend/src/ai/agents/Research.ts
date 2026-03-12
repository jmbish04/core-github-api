import { Hono } from 'hono';
import { z } from 'zod';
import { createAgent, tool } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { getOctokit } from '@services/octokit/core';

export const { Agent, handler } = createAgent<Env>({
  name: 'research',
  model: 'claude-3-5-sonnet-latest',
  system: `You are a senior research analyst specializing in GitHub repository analysis.

Your capabilities:
- Search and analyze GitHub repositories
- Clone repositories for deep code analysis
- Generate insights about code architecture and patterns
- Query vectorized code embeddings for semantic search

When a user asks you to research a repository:
1. Generate a research plan
2. Use tools to gather information
3. Trigger deep analysis workflows when needed
4. Synthesize findings into actionable insights

Always be thorough but concise. Focus on practical insights that developers can use.`,
  binding: 'RESEARCH_AGENT',
  tools: [
    tool({
      name: 'search_github_code',
      description: "Search for code in GitHub repositories using GitHub's specialized search syntax.",
      input: z.object({
        query: z.string().describe('The search query. Supports qualifiers like org:cloudflare or repo:owner/name.'),
        regex_filter: z.string().optional().describe('Optional JS-compatible regex string to filter the search results locally.'),
        max_results: z.number().optional().describe('Maximum number of results to return (default: 10).'),
      }),
      handler: async (params, ctx) => {
        try {
          const octokit = await getOctokit(ctx?.env as Env);
          const { data } = await octokit.search.code({
            q: params.query,
            per_page: Math.min(params.max_results || 10, 100),
          });

          let items = data.items.map((item) => ({
            name: item.name,
            path: item.path,
            repository: item.repository.full_name,
            html_url: item.html_url,
            score: item.score,
          }));

          if (params.regex_filter) {
            try {
              const regex = new RegExp(params.regex_filter);
              items = items.filter((item) => regex.test(item.path));
            } catch {
              return { error: `Invalid regex provided: ${params.regex_filter}` };
            }
          }

          return {
            total_count_raw: data.total_count,
            returned_count: items.length,
            items,
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      },
    }),
  ],
  memory: buildMaxAgentMemory({
    agentName: 'ResearchAgent',
    semanticBinding: 'RESEARCH_INDEX',
    graphId: 'core-github-api-research',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'ResearchAgent' }));
app.get('/docs', (c) => c.text('Research Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'ResearchAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'ResearchAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class ResearchAgent extends Agent {}
