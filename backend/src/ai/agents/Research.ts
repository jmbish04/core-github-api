import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';
import { getOctokit } from "@services/octokit/core";

export const { Agent, handler } = createAgent<Env>({
  name: "research",
  model: "claude-3-5-sonnet-latest",
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
  binding: "RESEARCH_AGENT",
  tools: [
    tool(
      'search_github_code', 
      "Search for code in GitHub repositories using GitHub's specialized search syntax.", 
      {
         query: z.string().describe("The search query. Supports qualifiers like `org:cloudflare`, `repo:owner/name`. Regex is NOT supported directly."),
         regex_filter: z.string().optional().describe("Optional JS-compatible regex string to filter the search results locally."),
         max_results: z.number().optional().describe("Maximum number of results to return (default: 10).")
      }, 
      async (params, ctx) => {
        try {
          const octokit = await getOctokit(ctx.env);
          
          try {
            const { data } = await octokit.search.code({
              q: params.query,
              per_page: Math.min(params.max_results || 10, 100),
            });

            let items = data.items.map((item: any) => ({
              name: item.name,
              path: item.path,
              repository: item.repository.full_name,
              html_url: item.html_url,
              score: item.score
            }));

            if (params.regex_filter) {
              try {
                const regex = new RegExp(params.regex_filter);
                items = items.filter((item: any) => regex.test(item.path));
              } catch (e) {
                return JSON.stringify({ error: `Invalid regex provided: ${params.regex_filter}` });
              }
            }

            return JSON.stringify({
              total_count_raw: data.total_count,
              returned_count: items.length,
              items
            });
          } catch (err: any) {
            return JSON.stringify({ error: `GitHub Search failed: ${err.message}` });
          }
        } catch (parseError: any) {
          return JSON.stringify({ error: `Failed to execute tool: ${parseError.message}` });
        }
      }
    )
  ],
  memory: {
     working: true
  },
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true }
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'ResearchAgent' }));
app.get('/docs', (c) => c.text('Research Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'ResearchAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'ResearchAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;

export class ResearchAgent extends Agent {}
