/**
 * @file GithubAgent/index.ts
 * @description GithubAgent — Agent consolidating Owner, Repo, and PrReviewer.
 *              Manages GitHub webhooks, repository AI operations, and PR review via Jules.
 *
 * @capabilities
 *  - owner: Organization/owner webhook processing and stats aggregation
 *  - repo: Repository-scoped webhooks, AI text/structured generation
 *  - pr-reviewer: Autonomous Jules-orchestrated PR review
 *  - webhook-handler: Unified entry point for all GitHub events
 */

import { callable } from 'agents';
import { BaseAgent } from '@/ai/providers';
import { runGithubAgentHealthChecks } from './health';

import { type AgentTool } from '@/ai/providers';
// Logger is inherited from BaseAgent via this.logger
import { desc, eq } from 'drizzle-orm';
import { getAgentDb, agentSchema, migrateAgentDb, type AgentDb } from '@/db/schemas/agents/stateful';
import { verifySignature } from '@/utils/crypto';
import { getSecret } from '@/utils/secrets';
import { reviewPr, processRepoWebhook, getRepoEvents, clearRepoEvents } from './methods';
import { searchCode, getFileContent, createPullRequest, checkDuplicatePR, type CreatePullRequestParams } from './methods/shared';
import { PrReviewTaskSchema } from './types';
import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';
import type {
  RepoState,
  OwnerState,
  GitHubEventType,
  GitHubWebhookPayload,
  StoredEvent,
} from './types';


// ── Combined State ──────────────────────────────────────────────────────────

type GithubAgentState = RepoState & {
  ownerName?: string;
  ownerStats?: OwnerState['stats'];
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent Class
// ─────────────────────────────────────────────────────────────────────────────

export class GithubAgent extends BaseAgent<GithubAgentState> {
  private _db: AgentDb | null = null;
  protected get agentName() { return 'GithubAgent'; }
  protected get skills() { return ['github-api', 'git-ops']; }

  initialState: GithubAgentState = {
    repoFullName: '',
    stats: { stars: 0, forks: 0, openIssues: 0 },
    lastUpdated: null,
    webhookConfigured: false,
    status: 'idle',
    history: [],
  };

  async agentInit() {
    this._db = getAgentDb((this as any).ctx.storage);
    await migrateAgentDb((this as any).ctx.storage);
  }

  private get db(): AgentDb {
    if (!this._db) {
      this._db = getAgentDb((this as any).ctx.storage);
    }
    return this._db;
  }

  private async ensureReady() {
    // BaseAgent ensures stateStore and ai are ready
    this.logger.info(`[GithubAgent - ensureReady] GithubAgent is ready`);
  }

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(mode: HealthMode): Promise<HealthCheck[]> {
    return runGithubAgentHealthChecks(this.env, this, mode);
  }

  // ── RPC: Chat (from Repo) ──────────────────────────────────────────────

  @callable()
  async chat(prompt: string, _context?: any): Promise<string> {
    this.logger.info(`[chat] Generating text for prompt: ${prompt.slice(0, 80)}...`);
    const result = await this.generateText({ prompt });
    this.logger.info(`[chat] Response generated (${result.length} chars)`);
    return result;
  }

  // ── RPC: Webhook Entry (from Owner + Repo) ─────────────────────────────

  @callable()
  async handleWebhookEvent(eventName: string, payload: GitHubWebhookPayload): Promise<void> {
    this.logger.info(`[handleWebhookEvent] Processing event: ${eventName}`);
    await processRepoWebhook(this.db, (this as any).stateStore, eventName as GitHubEventType, payload);
    this.logger.info(`[handleWebhookEvent] Event ${eventName} processed successfully`);
  }

  // ── RPC: PR Review (from PrReviewer) ───────────────────────────────────

  @callable()
  async reviewPullRequest(task: {
    owner: string; repo: string; pullNumber: number;
    title?: string; branch?: string;
  }) {
    this.logger.info(`[reviewPullRequest] Reviewing PR #${task.pullNumber} on ${task.owner}/${task.repo}`);
    const parsed = PrReviewTaskSchema.parse(task);
    const result = await reviewPr((this as any).ai, (this as any).env, parsed);
    this.logger.info(`[reviewPullRequest] Review complete for PR #${task.pullNumber}`);
    return result;
  }

  // ── RPC: GitHub Utilities ──────────────────────────────────────────────

  @callable()
  async searchCode(query: string, repoContext?: any): Promise<any> {
    this.logger.info(`[searchCode] Searching code for query: ${query}`);
    return searchCode((this as any).env, query, repoContext);
  }

  @callable()
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    this.logger.info(`[getFileContent] Fetching ${owner}/${repo}/${path}`);
    return getFileContent((this as any).env, owner, repo, path, ref);
  }

  @callable()
  async createPullRequest(params: CreatePullRequestParams): Promise<string> {
    this.logger.info(`[createPullRequest] Creating PR on ${params.owner}/${params.repo}`);
    return createPullRequest((this as any).env, params);
  }

  @callable()
  async checkDuplicatePR(owner: string, repo: string, title?: string): Promise<any[]> {
    this.logger.info(`[checkDuplicatePR] Checking duplicates in ${owner}/${repo}`);
    return checkDuplicatePR((this as any).env, owner, repo, title);
  }

  @callable()
  async searchRepositories(args: { query: string; perPage?: number; page?: number }): Promise<any[]> {
    this.logger.info(`[searchRepositories] Searching repos for: ${args.query.slice(0, 80)}`);
    const { searchRepositoriesImpl } = await import('./methods/search');
    return searchRepositoriesImpl((this as any).env, args);
  }

  // ── RPC: Sentinel Tasks ────────────────────────────────────────────────

  @callable()
  async judgeTask(payload: { taskId: string; repoId: string | null; assignee: string | null; title: string | null; notes: string | null }) {
    this.logger.info(`[judgeTask] Received Sentinel task for judging: ${payload.taskId}`, { assignee: payload.assignee, title: payload.title });
    return { ok: true, taskId: payload.taskId };
  }

  // ── RPC: Events (from Owner + Repo) ────────────────────────────────────

  @callable()
  getEvents(limit = 20): StoredEvent[] {
    this.logger.info(`[getEvents] Fetching last ${limit} events`);
    return getRepoEvents(this.db, limit);
  }

  @callable()
  getStats(): GithubAgentState['stats'] {
    return (this as any).stateStore.state.stats;
  }

  @callable()
  async clearEvents(): Promise<void> {
    this.logger.info('[clearEvents] Clearing all stored events');
    await clearRepoEvents(this.db, (this as any).stateStore);
    this.logger.info('[clearEvents] Events cleared');
  }

  @callable()
  getAutomationRuns(eventId: string) {
    const rows = this.db
      .select()
      .from(agentSchema.automationRuns)
      .where(eq(agentSchema.automationRuns.eventId, eventId))
      .orderBy(desc(agentSchema.automationRuns.startedAt))
      .all();

    return rows.map((r) => ({
      id: r.id, ruleId: r.ruleId, ruleName: r.ruleName,
      workflow: r.workflow, eventId: r.eventId, status: r.status,
      startedAt: r.startedAt, completedAt: r.completedAt || undefined,
    }));
  }

  @callable()
  storeAutomationRun(run: {
    id: string; ruleId: string; ruleName: string;
    workflow: string; eventId: string; status: string; startedAt: string;
  }): void {
    this.db
      .insert(agentSchema.automationRuns)
      .values({
        id: run.id, ruleId: run.ruleId, ruleName: run.ruleName,
        workflow: run.workflow, eventId: run.eventId, status: run.status,
        startedAt: run.startedAt,
      })
      .onConflictDoUpdate({
        target: agentSchema.automationRuns.id,
        set: {
          ruleId: run.ruleId, ruleName: run.ruleName, workflow: run.workflow,
          eventId: run.eventId, status: run.status, startedAt: run.startedAt,
        },
      })
      .run();
  }

  // ── AI Generation (from Repo) ──────────────────────────────────────────

  async generateText(input: { prompt: string; provider?: string; model?: string; instructions?: string }): Promise<string> {
    return (this as any).ai.chat.generateText(
      [{ role: 'user', content: input.prompt }],
      input.instructions || 'You are GithubAgent, a focused repository intelligence assistant. Be concise and specific.',
      { provider: input.provider, model: input.model, skills: (this as any).skills },
    );
  }

  async generateStructuredResponse<T = unknown>(input: {
    prompt: string; outputType: any; provider?: string; model?: string; instructions?: string;
  }): Promise<T> {
    const result = await (this as any).ai.chat.generateObject(
      [{ role: 'user', content: input.prompt }],
      input.outputType,
      input.instructions || 'Return output that strictly matches the requested schema.',
      { provider: input.provider, model: input.model, skills: (this as any).skills },
    );
    return result as Promise<T>;
  }

  async generateWithTools(input: {
    prompt: string; tools: AgentTool[]; provider?: string; model?: string; instructions?: string;
  }): Promise<unknown> {
    const instructions =
      (input.instructions || 'Use tools when useful and provide concise, actionable outputs.') +
      (this as any).ai.buildToolInstructions(input.tools);
    return (this as any).ai.chat.generateText(
      [{ role: 'user', content: input.prompt }],
      instructions,
      { provider: input.provider, model: input.model, skills: (this as any).skills },
    );
  }

  // ── HTTP Fallback ───────────────────────────────────────────────────────

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.logger.info(`[onRequest] ${request.method} ${url.pathname}`);

    // Agent-specific GET routes
    if (url.pathname === '/health-probe') {
      return Response.json(await this.healthProbe());
    }
    if (url.pathname === '/memory') {
      await this.stateStore.ready();
      return Response.json(this.stateStore.state);
    }
    if (url.pathname === '/history') {
      await this.stateStore.ready();
      return Response.json(this.stateStore.state.history || []);
    }

    // Agent-specific POST routes
    if (request.method === 'POST') {
      if (url.pathname === '/store-automation') {
        const body = await request.json() as any;
        this.logger.info('[onRequest] Storing automation run', { id: body.id, workflow: body.workflow });
        this.storeAutomationRun(body);
        return new Response('OK', { status: 200 });
      }

      if (url.pathname === '/review') {
        try {
          const body = await request.json();
          const task = PrReviewTaskSchema.parse(body);
          this.logger.info(`[onRequest] PR review requested: ${task.owner}/${task.repo}#${task.pullNumber}`);
          const result = await reviewPr(this.ai, this.env, task);
          this.logger.info(`[onRequest] PR review complete for ${task.owner}/${task.repo}#${task.pullNumber}`);
          return Response.json(result);
        } catch (error: any) {
          this.logger.error('[onRequest] PR review parse/execute error', { error: error.message });
          return new Response(error.message, { status: 400 });
        }
      }

      // GitHub webhook handler
      const eventType = request.headers.get('X-GitHub-Event') as GitHubEventType | null;
      if (eventType) {
        this.logger.info(`[onRequest] Incoming GitHub webhook: ${eventType}`);
        const signature = request.headers.get('X-Hub-Signature-256');
        const body = await request.text();
        const apiKey = await getSecret(this.env, 'WORKER_API_KEY');
        if (apiKey) {
          const isValid = await verifySignature(body, signature, apiKey);
          if (!isValid) {
            this.logger.warn(`[onRequest] Invalid webhook signature for ${eventType}`);
            return new Response('Invalid signature', { status: 401 });
          }
        }
        const payload = JSON.parse(body) as GitHubWebhookPayload;
        await processRepoWebhook(this.db, this.stateStore, eventType, payload);
        this.logger.info(`[onRequest] Webhook ${eventType} processed`);
        return new Response('OK', { status: 200 });
      }
    }

    // Fall through to BaseAgent.onRequest for /stream, WebSocket, and SDK @callable routing
    this.logger.info(`[onRequest] Fall through to BaseAgent.onRequest for ${request.url}`);
    return super.onRequest(request);
  }
}
