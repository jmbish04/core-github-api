/**
 * Health Diagnostician Agent (Autonomous SRE)
 */
import { Buffer } from 'node:buffer';
import { Octokit } from '@octokit/rest';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentStructured, resolveAgentModel, resolveAgentProvider } from '@/ai/agents/support/inference';
import type { AgentTool, PersistentAgentState } from '@/ai/agents/support/types';
import { getDb } from '@db';
import { healthResults } from '@db/schemas/logs/health';
import { julesJobs } from '@/db/schemas/agents/jules';
import { JulesService } from '@/services/jules/service';

const HealthDiagnosticianOutputSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  rootCause: z.string().describe('Explanation of the root cause'),
  suggestedFix: z.string().describe('Fix details or reasoning for not fixing'),
  prUrl: z.string().nullable().describe('URL to the PR created, or Jules Session ID, or null if transient'),
});

type HealthDiagnosticianOutput = z.infer<typeof HealthDiagnosticianOutputSchema>;

const healthDiagnosticianRuntime = createAgent<Env>({
  name: 'health-diagnostician',
  model: 'claude-3-5-sonnet-latest',
  system: 'You diagnose Cloudflare health failures and propose the correct remediation path.',
  binding: 'HEALTH_DIAGNOSTICIAN',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'HealthDiagnostician',
    graphId: 'core-github-api-health-diagnostician',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const HealthDiagnosticianDurableObject = healthDiagnosticianRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class HealthDiagnostician extends HealthDiagnosticianDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<PersistentAgentState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<PersistentAgentState>({
      ctx,
      env,
      agentName: 'HealthDiagnostician',
      initialState: { status: 'idle', history: [] },
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/diagnose') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      return this.handleDiagnose(request);
    }

    return super.fetch(request);
  }

  private async handleDiagnose(request: Request) {
    await this.store.setStatus('running');

    const payload = await request.json<{
      errorName: string;
      errorMessage: string;
      errorDetails: any;
      category: string;
      target: string;
    }>();

    const ghToken = typeof (this.env as any).GITHUB_TOKEN === 'object' && (this.env as any).GITHUB_TOKEN?.get
      ? await (this.env as any).GITHUB_TOKEN.get()
      : (this.env as any).GITHUB_TOKEN;

    const octokit = new Octokit({ auth: ghToken });
    const repoOwner = this.env.GITHUB_OWNER || 'jmbish04';
    const repoName = this.env.CLOUDFLARE_WORKER_NAME || 'core-github-api';
    const { data: repoData } = await octokit.repos.get({ owner: repoOwner, repo: repoName });
    const defaultBranch = repoData.default_branch;

    const { rewriteQuestionForMCP } = await import('@/ai/providers');
    const { queryMCP } = await import('@/ai/mcp/mcp-client');

    const mcpQuery = `How to fix Cloudflare worker error: ${payload.errorName} - ${payload.errorMessage}`;
    let rewritten = mcpQuery;
    try {
      const rewrittenResult = await rewriteQuestionForMCP(this.env, mcpQuery);
      if (rewrittenResult) {
        rewritten = rewrittenResult;
      }
    } catch (error) {
      this.store.logger.warn('rewriteQuestionForMCP fallback', { error });
    }

    let mcpContext = 'No Cloudflare Docs context available.';
    try {
      const mcpResult = await queryMCP(rewritten, 'HealthDiagnostician');
      mcpContext = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
    } catch (error) {
      this.store.logger.warn('queryMCP failed', { error });
    }

    const instructions = `You are a Senior Engineer and an autonomous Site Reliability Agent operating on the Cloudflare ecosystem.
Your primary directive is to investigate, diagnose, and remediate system health failures within the repository \`${repoOwner}/${repoName}\`.

CRITICAL PRE-FLIGHT CHECK:
1. Deduplication: You MUST use \`check_duplicate_pr\` to ensure no PRs or Jules tasks already exist for this issue. If one exists, halt immediately and return the URL in your final output.

TRIAGE AND REMEDIATION:
2. Analyze & Investigate: Read the error details, pull the failing code using \`get_github_file\`, and consult Cloudflare MCP documentation if needed.
3. Reason about Complexity: Determine the scope of the fix.
   - IF the fix is SMALL: formulate the fix and use \`create_pull_request\` to submit it immediately.
   - IF the fix is COMPLEX: use \`delegate_to_jules\` to dispatch a deep-reasoning session to Google Jules.

Conclude your investigation with a detailed summary containing the severity, rootCause, suggestedFix, and prUrl.`;

    const MAX_LOG_LENGTH = 15000;
    let stringifiedDetails = JSON.stringify(payload.errorDetails, null, 2) || '{}';

    if (Array.isArray(payload.errorDetails) && stringifiedDetails.length > MAX_LOG_LENGTH) {
      try {
        this.store.logger.info('Extracting relevant logs via Vectorize RAG...');
        const { vectorizeAndStoreLogs } = await import('@/ai/utils/log-vectorizer');
        const { generateEmbeddings } = await import('@/ai/providers');

        const runId = `diag-${Date.now()}`;
        await vectorizeAndStoreLogs(this.env, runId, payload.errorDetails);

        const queryEmbeddings = await generateEmbeddings(
          this.env,
          ['Find fatal errors, agent execution failures, timeouts, 400 status codes, crash stack traces, and high severity warnings.'],
        );
        const vectorMatches = await this.env.VECTORIZE_LOGS.query(queryEmbeddings[0], {
          topK: 10,
          filter: { runId },
          returnValues: false,
          returnMetadata: true,
        });

        const relevantLogs = vectorMatches.matches
          .map((match) => match.metadata?.content)
          .filter(Boolean)
          .join('\n\n---\n\n');

        stringifiedDetails = `[RAG FETCHED RELEVANT LOG CHUNKS]\n${relevantLogs}`;
        this.store.logger.info(`Successfully retrieved ${vectorMatches.matches.length} relevant chunks`);
      } catch (error: any) {
        this.store.logger.error('RAG Log Vectorization failed, falling back to truncation', error);
        stringifiedDetails = `${stringifiedDetails.substring(0, MAX_LOG_LENGTH)}\n...[RAG ERROR, TRUNCATED FOR LENGTH]`;
      }
    } else if (stringifiedDetails.length > MAX_LOG_LENGTH) {
      stringifiedDetails = `${stringifiedDetails.substring(0, MAX_LOG_LENGTH)}\n...[TRUNCATED FOR LENGTH to prevent 400 payload rejection]`;
    }

    const prompt = `Health Check Failed in category: ${payload.category}\nTarget: ${payload.target}\nError: ${payload.errorName} - ${payload.errorMessage}\nDetails: ${stringifiedDetails}\n\nRelevant Cloudflare Docs Context:\nQuery: ${rewritten}\nDocs Result: ${mcpContext}`;

    const tools: AgentTool[] = [
      {
        name: 'check_duplicate_pr',
        description: 'Check for identical active pull requests or database suggestion records.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute: async () => {
          try {
            const { data: prs } = await octokit.pulls.list({ owner: repoOwner, repo: repoName, state: 'open' });
            const openPrs = prs.map((pr) => ({ title: pr.title, url: pr.html_url }));

            const db = getDb(this.env.DB);
            const recentFailures = await db.select()
              .from(healthResults)
              .where(eq(healthResults.status, 'failure'))
              .orderBy(desc(healthResults.timestamp))
              .limit(10);

            const recentAiSuggestions = recentFailures
              .filter((failure) => failure.ai_suggestion && failure.ai_suggestion.includes('github.com'))
              .map((failure) => ({ target: failure.name, suggestion: failure.ai_suggestion }));

            return { activePullRequests: openPrs, recentDatabaseActions: recentAiSuggestions };
          } catch (error: any) {
            this.store.logger.error('check_duplicate_pr failed', error);
            return { error: error.message };
          }
        },
      },
      {
        name: 'get_github_file',
        description: 'Fetch file content from GitHub.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
        execute: async (args: Record<string, unknown>) => {
          try {
            const { data } = await octokit.repos.getContent({ owner: repoOwner, repo: repoName, path: String(args.path || '') });
            if ('content' in data && typeof data.content === 'string') {
              return Buffer.from(data.content, 'base64').toString('utf-8');
            }
            return 'File is not a standard text file or is a directory.';
          } catch (error: any) {
            this.store.logger.error('get_github_file failed', error);
            return `Failed to fetch file: ${error.message}`;
          }
        },
      },
      {
        name: 'create_pull_request',
        description: 'Create a new pull request on GitHub.',
        parameters: {
          type: 'object',
          properties: {
            branchName: { type: 'string' },
            filePath: { type: 'string' },
            newContent: { type: 'string' },
            commitMessage: { type: 'string' },
            prTitle: { type: 'string' },
            prBody: { type: 'string' },
          },
          required: ['branchName', 'filePath', 'newContent', 'commitMessage', 'prTitle', 'prBody'],
          additionalProperties: false,
        },
        execute: async (args: Record<string, unknown>) => {
          try {
            const branchName = String(args.branchName || '');
            const filePath = String(args.filePath || '');
            const newContent = String(args.newContent || '');
            const commitMessage = String(args.commitMessage || '');
            const prTitle = String(args.prTitle || '');
            const prBody = String(args.prBody || '');

            const { data: refData } = await octokit.git.getRef({ owner: repoOwner, repo: repoName, ref: `heads/${defaultBranch}` });
            await octokit.git.createRef({ owner: repoOwner, repo: repoName, ref: `refs/heads/${branchName}`, sha: refData.object.sha });

            let fileSha: string | undefined;
            try {
              const { data: fileData } = await octokit.repos.getContent({ owner: repoOwner, repo: repoName, path: filePath, ref: branchName });
              if (!Array.isArray(fileData) && fileData.type === 'file') {
                fileSha = fileData.sha;
              }
            } catch (e){
              this.store.logger.error('get_github_file failed', JSON.stringify(e));
            }

            await octokit.repos.createOrUpdateFileContents({
              owner: repoOwner,
              repo: repoName,
              path: filePath,
              message: commitMessage,
              content: Buffer.from(newContent).toString('base64'),
              branch: branchName,
              sha: fileSha,
            });

            const { data: prData } = await octokit.pulls.create({
              owner: repoOwner,
              repo: repoName,
              title: prTitle,
              body: prBody,
              head: branchName,
              base: defaultBranch,
            });

            return `Successfully created PR: ${prData.html_url}`;
          } catch (error: any) {
            this.store.logger.error('create_pull_request failed', error);
            return `PR Creation failed: ${error.message}`;
          }
        },
      },
      {
        name: 'delegate_to_jules',
        description: 'Delegate fixing the issues to a Jules deeper reasoning AI.',
        parameters: { type: 'object', properties: { prompt: { type: 'string' }, autoPr: { type: 'boolean' } }, required: ['prompt'], additionalProperties: false },
        execute: async (args: Record<string, unknown>) => {
          try {
            const julesService = JulesService.getInstance(this.env);
            const promptText = String(args.prompt || '');
            const autoPr = Boolean(args.autoPr || false);
            const session = await julesService.startSession({
              prompt: promptText,
              autoPr,
              repo: { owner: repoOwner, repo: repoName, branch: defaultBranch },
            });

            const db = getDb(this.env.DB);
            await db.insert(julesJobs).values({
              sessionId: session.id,
              repoFullName: `${repoOwner}/${repoName}`,
              prompt: promptText,
              status: 'pending',
            });

            return `Successfully delegated to Jules. Session ID: ${session.id}`;
          } catch (error: any) {
            this.store.logger.error('delegate_to_jules failed', error);
            return `Delegation failed: ${error.message}`;
          }
        },
      },
      {
        name: 'search_cloudflare_documentation',
        description: 'Search the Cloudflare documentation for specific products, features, or error codes. Returns semantic chunks.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
        execute: async (args: Record<string, unknown>) => {
          try {
            const { queryMCP } = await import('@/ai/mcp/mcp-client');
            const result = await queryMCP(String(args.query || ''), 'HealthDiagnostician');
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (error: any) {
            return JSON.stringify({ error: `MCP Query failed: ${error.message}` });
          }
        },
      },
    ];

    try {
      const provider = resolveAgentProvider(this.env);
      const model = resolveAgentModel(this.env, provider);
      const payloadBytes = new TextEncoder().encode(prompt).length;
      this.store.logger.info(`[HealthDiagnostician] Outbound Prompt Payload Size: ${payloadBytes} bytes`);

      const finalData = await runAgentStructured<HealthDiagnosticianOutput>({
        env: this.env,
        logger: this.store.logger,
        name: 'HealthDiagnostician',
        instructions,
        prompt,
        schema: HealthDiagnosticianOutputSchema,
        tools,
        provider,
        model,
      });

      await this.store.set({
        ...this.store.state,
        status: 'completed',
        lastResult: finalData,
        history: [...this.store.state.history, { payload, finalData }],
      });

      return Response.json(finalData);
    } catch (error: any) {
      this.store.logger.error('HealthDiagnostician Execution Failed', { error });
      await this.store.setStatus('failed');

      const fallback: HealthDiagnosticianOutput = {
        severity: 'high',
        rootCause: `Agent execution failed: ${error.message}`,
        suggestedFix: 'Review raw logs. The agent encountered a fatal error during the diagnostic loop.',
        prUrl: null,
      };

      return Response.json(fallback, { status: 500 });
    }
  }
}
