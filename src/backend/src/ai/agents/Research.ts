import { Hono } from 'hono';
import { z } from 'zod';
import { createAgent, tool } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { getOctokit } from '@services/octokit/core';
import { buildSkillContext } from '@services/octokit/skill-fetcher';

export const { Agent, handler } = createAgent<Env>({
  name: 'research',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  system: async (ctx: { env: Env }) => {
    const skills = await buildSkillContext(ctx.env as any, 'ResearchAgent');
    return `You are a senior research analyst specialising in GitHub repository analysis.

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

Always be thorough but concise. Focus on practical insights that developers can use.${skills}`;
  },
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
    tool({
      name: 'analyze_repository',
      description: 'Use the Jules SDK to perform a deep repoless analysis or query of a repository.',
      input: z.object({
        repoUrl: z.string().describe('Repository URL or owner/name format.'),
        prompt: z.string().describe('The research prompt or question about the codebase.'),
      }),
      handler: async (params, ctx) => {
        try {
          const { analyzeRepo } = await import('@/ai/providers/jules');
          const result = await analyzeRepo(ctx.env as Env, params.repoUrl, params.prompt);
          return { result };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Jules analysis failed' };
        }
      }
    }),
    tool({
      name: 'create_coding_plan',
      description: 'Use the Jules SDK to generate a structured coding plan based on research findings.',
      input: z.object({
        prompt: z.string().describe('A detailed task description explaining what needs to be planned.'),
      }),
      handler: async (params, ctx) => {
        try {
          const { createPlan } = await import('@/ai/providers/jules');
          const result = await createPlan(ctx.env as Env, params.prompt);
          return { result };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Jules planning failed' };
        }
      }
    }),
    tool({
      name: 'execute_github_task',
      description: 'Use the Jules SDK session toolkit to complete a task directly in a GitHub repository.',
      input: z.object({
        repoUrl: z.string().describe('Repository URL or owner/name format.'),
        issueId: z.string().describe('The GitHub issue ID or task identifier to complete.'),
      }),
      handler: async (params, ctx) => {
        try {
          const { completeTask } = await import('@/ai/providers/jules');
          const result = await completeTask(ctx.env as Env, params.repoUrl, params.issueId);
          return { result };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Jules task execution failed' };
        }
      }
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
