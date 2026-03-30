import { Hono } from 'hono';
import { z } from 'zod';
import { createAgent, tool } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { getOctokit } from '@services/octokit/core';
import { buildSkillContext } from '@services/octokit/skill-fetcher';
import { checkAPIHealth } from '@/routes/api/health';


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

When the user asks you to "Begin Jules orchestration for research task...", you MUST immediately invoke
the \`orchestrate_jules_research\` tool with the provided projectId and queueRepo values. 

**CRITICAL**: Never attempt to manually orchestrate the session yourself via chat messages; the tool handles the long-running polling automatically.

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
        const { Logger } = await import('@/lib/logger');
        const logger = new Logger(ctx.env as Env, 'ResearchAgent');
        logger.info('Executing search_github_code', { params });
        try {
          const octokit = await getOctokit(ctx?.env as Env);
          const { data } = await octokit.search.code({
            q: params.query,
            per_page: Math.min(params.max_results || 10, 100),
          });
          logger.info('GitHub Search Code results fetched', { total_count: data.total_count });

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
              logger.info('Applied regex filter', { returned_count: items.length });
            } catch (err: any) {
              const errMsg = err instanceof Error ? err.message : 'Unknown Error';
              logger.error('Invalid regex provided', { regex: params.regex_filter, error: errMsg });
              await logger.flush();
              return { error: `Invalid regex provided: ${params.regex_filter}` };
            }
          }

          await logger.flush();
          return {
            total_count_raw: data.total_count,
            returned_count: items.length,
            items,
          };
        } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Failed to execute search_github_code', { error: errMsg });
          await logger.flush();
          return { error: errMsg };
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
        const { Logger } = await import('@/lib/logger');
        const logger = new Logger(ctx.env as Env, 'ResearchAgent');
        logger.info('Executing analyze_repository', { params });
        try {
          const health = await checkAPIHealth(ctx.env as Env);
          if (health.status !== 'success') {
             logger.error('Infrastructure Dependency Failure', { details: health.details });
             await logger.flush();
             return { error: 'Infrastructure Dependency Failure: Health check failed before Jules dispatch.', details: health.details };
          }
          const { analyzeRepo } = await import('@/ai/providers/jules');
          const result = await analyzeRepo(ctx.env as Env, params.repoUrl, params.prompt);
          logger.info('analyze_repository completed successfully', { repoUrl: params.repoUrl });
          await logger.flush();
          return { result };
        } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : 'Jules analysis failed';
          logger.error('Jules analysis failed', { error: errMsg });
          await logger.flush();
          return { error: errMsg };
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
        const { Logger } = await import('@/lib/logger');
        const logger = new Logger(ctx.env as Env, 'ResearchAgent');
        logger.info('Executing create_coding_plan', { params });
        try {
          const { createPlan } = await import('@/ai/providers/jules');
          const result = await createPlan(ctx.env as Env, params.prompt);
          logger.info('create_coding_plan completed successfully');
          await logger.flush();
          return { result };
        } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : 'Jules planning failed';
          logger.error('Jules planning failed', { error: errMsg });
          await logger.flush();
          return { error: errMsg };
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
        const { Logger } = await import('@/lib/logger');
        const logger = new Logger(ctx.env as Env, 'ResearchAgent');
        logger.info('Executing execute_github_task', { params });
        try {
          const health = await checkAPIHealth(ctx.env as Env);
          if (health.status !== 'success') {
             logger.error('Infrastructure Dependency Failure', { details: health.details });
             await logger.flush();
             return { error: 'Infrastructure Dependency Failure: Health check failed before Jules dispatch.', details: health.details };
          }
          const { completeTask } = await import('@/ai/providers/jules');
          const result = await completeTask(ctx.env as Env, params.repoUrl, params.issueId);
          logger.info('execute_github_task completed successfully', { repoUrl: params.repoUrl, issueId: params.issueId });
          await logger.flush();
          return { result };
        } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : 'Jules task execution failed';
          logger.error('Jules task execution failed', { error: errMsg });
          await logger.flush();
          return { error: errMsg };
        }
      }
    }),
    tool({
      name: 'orchestrate_jules_research',
      description: 'Orchestrate an autonomous Jules research session on a staging repository.',
      input: z.object({
        projectId: z.string().describe('The research task ID'),
        queueRepo: z.string().describe('The staging repository, e.g., jmbish04/core-github-research'),
      }),
      handler: async (params, ctx) => {
        const { Logger } = await import('@/lib/logger');
        const logger = new Logger(ctx.env as Env, 'JulesOrchestrator');
        try {
          const { projectId, queueRepo } = params;
          const { getJulesClient, setupOpenAIAgentClient } = await import('@/ai/providers');
          const julesClient = await getJulesClient(ctx.env as Env);
          await setupOpenAIAgentClient(ctx.env as Env, "workers-ai");
          
          const { Agent, run } = await import('@openai/agents');
          const overseer = new Agent({
             name: "ResearchOverseer",
             instructions: "You are a Senior Architect overseeing a research agent. Keep Jules unblocked and instruct it to strictly format the final output as JSON according to the schema provided.",
             model: "workers-ai/@cf/openai/gpt-oss-120b",
          });
          
          logger.info('Starting Jules session orchestration', { projectId, queueRepo });

          // JSON schema instruction
          const jsonSchemaStr = `{\n  "overview": "string",\n  "keyFindings": ["string"],\n  "architecturalPatterns": ["string"],\n  "securityConcerns": ["string"]\n}`;

          const session = await julesClient.session({
             title: `Research Task: ${projectId}`,
             prompt: `Analyze the staged content in the folder daily-research/${projectId}/ in this repository. Ensure you look at all markdown files and code. Your final output MUST be a strict JSON object matching this schema:\n\n${jsonSchemaStr}\n\nDo not include any other markdown in your final response.`,
             source: {
               github: queueRepo,
               baseBranch: "main"
             },
             requireApproval: false,
             autoPr: false
          });

          let isTerminal = false;
          let finalOutcome: any = null;
          let lastProcessedActivityId: string | null = null;
          
          while (!isTerminal) {
             const info = await session.info();
             const state = info.state;
             
             if (state === 'completed' || state === 'failed') {
               finalOutcome = info.outcome;
               isTerminal = true;
               break;
             }
             
             if (state === 'awaitingPlanApproval') {
                await session.approve();
             }
             
             const activities = await session.activities.select({ limit: 1 });
             const lastActivity = activities[0];
             
             if (lastActivity && lastActivity.id !== lastProcessedActivityId && lastActivity.type === 'agentMessaged' && lastActivity.originator === 'agent') {
                const guidanceResult = await run(overseer, `The research agent asks: ${lastActivity.message}`);
                const reply = (typeof guidanceResult.finalOutput === 'string' ? guidanceResult.finalOutput : JSON.stringify(guidanceResult.finalOutput));
                await session.send(reply || "Proceed.");
                lastProcessedActivityId = lastActivity.id;
             }
             
             await new Promise(resolve => setTimeout(resolve, 10000));
          }
          
          const activities = await session.activities.select({ limit: 20 });
          const messages = activities.filter((a: any) => a.type === 'agentMessaged' && a.originator === 'agent');
          const lastMsg = messages.pop()?.message || "{}";
          
          let reportObj = {};
          try {
             const match = lastMsg.match(/\{[\s\S]*\}/);
             if (match) reportObj = JSON.parse(match[0]);
             else reportObj = JSON.parse(lastMsg);
          } catch(e: any) {
             const errMsg = e instanceof Error ? e.message : 'Unknown JSON parse error';
             logger.error('Failed to parse final JSON', { rawContent: lastMsg, error: errMsg });
             reportObj = { overview: "Failed to parse final JSON", rawContent: lastMsg, error: errMsg };
          }
          
          const { getDb } = await import('@db');
          const { researchReports, researchProjects } = await import('@/db/schemas/github/research');
          const { eq } = await import('drizzle-orm');
          
          const db = getDb(ctx.env.DB);
          await db.insert(researchReports).values({
             id: crypto.randomUUID(),
             projectId,
             findings: reportObj,
             createdAt: new Date()
          });
          
          await db.update(researchProjects).set({ status: 'completed', updatedAt: new Date() }).where(eq(researchProjects.id, projectId));
          
          const projectRows = await db.select().from(researchProjects).where(eq(researchProjects.id, projectId));
          const projectTitle = projectRows[0]?.title || projectId;

          try {
             logger.info('Sending research findings email', { projectId, projectTitle });
             const { sendRepoDiscoveryEmail } = await import('@/utils/email/send/repo-discovery');
             
             let html = `<h2>Research Findings for Project: ${projectTitle}</h2>`;
             html += `<p>Here are the AI-discovered insights across the selected sources.</p>`;
             html += `<div style="background: #1e1e1e; color: #fff; padding: 1rem; border-radius: 8px; font-family: monospace; white-space: pre-wrap;">${JSON.stringify(reportObj, null, 2)}</div>`;
             
             await sendRepoDiscoveryEmail(ctx.env as Env, {
                to: 'subscriber@hacolby.app',
                subject: `Research Complete: ${projectTitle}`,
                title: 'Agentic Research Delivery',
                contentHtml: html
             });
             logger.info('Email sent successfully', { projectId });
          } catch (err: any) {
             logger.error('Failed to send research findings email', { projectId, error: err.message });
          }
          
          logger.info('Finished Jules session orchestration', { projectId, isTerminal });
          await logger.flush();
          return { success: true, outcome: finalOutcome, report: reportObj };
        } catch (error: any) {
          logger.error('Jules Orchestration failed', { error: error.message });
          await logger.flush();
          return { error: error.message };
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
