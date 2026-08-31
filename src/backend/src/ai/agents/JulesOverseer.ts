/**
 * @file src/ai/agents/JulesOverseer.ts
 * @description Asynchronous Durable Object that monitors Jules coding sessions.
 *
 * ## Monitoring Loop
 * Every scheduled check calls `checkJulesStatus()`, which:
 * 1. Loads all active jules_jobs from D1
 * 2. Calls `session.info()` to get the current state
 * 3. Takes a snapshot of recent activities via `getSessionSnapshot()`
 * 4. Routes to one of the conditional handlers:
 *
 * ## Snapshot-Based Conditional Handlers
 * | Jules State              | Handler                       |
 * |--------------------------|-------------------------------|
 * | AWAITING_PLAN_APPROVAL   | `handlePlanApproval()`        |
 * | AWAITING_USER_FEEDBACK   | `handleUserFeedback()`        |
 * | PAUSED / FAILED          | `handleBlockedSession()`      |
 * | COMPLETED / ready_for_pr | `handleCompletion()`          |
 * | IN_PROGRESS (CI failure) | `handleCIFailure()`           |
 *
 * ## CI Failure Handler
 * When the snapshot contains "CI failure" or "Workers Builds" language, the
 * JulesOverseer automatically:
 * 1. Identifies the PR number from session state
 * 2. Lists GitHub Check Runs for the PR HEAD commit
 * 3. Finds the failed "Workers Builds" check run
 * 4. Fetches raw Cloudflare build logs via CILogService
 * 5. Searches Cloudflare Docs (MCP) for relevant fix guidance
 * 6. Sends Jules a targeted remediation prompt with the full log context
 */

import { z } from 'zod';
import { eq, notInArray, desc } from 'drizzle-orm';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentText, resolveAgentModel, resolveAgentProvider } from '@/ai/agents/support/inference';
import type { AgentTool, PersistentAgentState } from '@/ai/agents/support/types';
import { getDb } from '@db';
import { julesSessions, julesJobs } from '@db/schemas/jules';
import { alerts } from '@/db/schemas/app/alerts';
import { learningAiInsights } from '@db/schemas/github/learning';
import { JulesService } from '@/services/jules/service';
import { CILogService } from '@/services/cloudflare/worker_cicd_build_logs';
import { dispatchUIFrameworkPlan as _dispatchUIFrameworkPlan } from '@/ai/agents/LandingPageAgent';

// ─── Constants ────────────────────────────────────────────────────────────────

const APOLOGY_PATTERNS = [
  /i('m| am) sorry/i,
  /i apologize/i,
  /my (mistake|bad|fault)/i,
  /let me try (again|a different)/i,
  /i keep (making|repeating)/i,
  /my oversight/i,
  /same error/i,
  /i was wrong/i,
  /i missed that/i,
];
const LOOP_THRESHOLD = 3;

const OVERRIDE_MESSAGE = `[SYSTEM OVERRIDE]: You are stuck in a circular apology loop.

MANDATORY STEPS BEFORE YOUR NEXT PROPOSAL:
1. Call contemplationGateCheck with the pattern you are trying to fix.
2. Query learning_ai_pr_reflections for prior attempts on this insight.
3. If a prior fix was FAILED or REVERTED: Do NOT repeat the local patch. Flag for template-level immunization.
4. If this is a NEW pattern: Proceed with the local patch.

Continuing the same approach without checking history is prohibited.`;

// ─── Types ───────────────────────────────────────────────────────────────────

type SessionCheckResult = {
  sessionId: string;
  status: string;
  actionTaken: string;
};

type SnapshotActivity = {
  type: string;
  message?: string;
  title?: string;
  timestamp?: string;
  artifacts?: any[];
};

// ─── Snapshot Analysis Helpers ────────────────────────────────────────────────

/** CI failure keywords found in Jules agentMessaged activities */
const CI_FAILURE_PATTERNS = [
  /ci failure/i,
  /workers builds/i,
  /build failed/i,
  /check run.*fail/i,
  /deployment failed/i,
  /wrangler.*error/i,
];

/** PR URL pattern used to extract PR number from session state */
const PR_NUMBER_REGEX = /\/pull\/(\d+)/;

/**
 * Returns true if a Jules session snapshot contains CI-failure indicators.
 */
function snapshotIndicatesCIFailure(snapshot: SnapshotActivity[]): boolean {
  for (const activity of snapshot) {
    const text = [activity.message, activity.title].filter(Boolean).join(' ');
    if (CI_FAILURE_PATTERNS.some((re) => re.test(text))) return true;
  }
  return false;
}

/**
 * Extracts PR number from a PR URL string (e.g. https://github.com/org/repo/pull/42)
 */
function extractPRNumber(prUrl?: string | null): number | null {
  if (!prUrl) return null;
  const m = prUrl.match(PR_NUMBER_REGEX);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Extracts the most recent agentMessaged content from a snapshot so the
 * Overseer knows what Jules last said before getting stuck.
 */
function latestAgentMessage(snapshot: SnapshotActivity[]): string | null {
  const msgs = snapshot
    .filter((a) => a.type === 'agentMessaged' && a.message)
    .sort((a, b) => (a.timestamp ?? '') < (b.timestamp ?? '') ? 1 : -1);
  return msgs[0]?.message ?? null;
}

// ─── Agent Runtime ────────────────────────────────────────────────────────────

const julesOverseerRuntime = createAgent<Env>({
  name: 'jules-overseer',
  model: 'claude-3-5-sonnet-latest',
  system: 'You supervise long-running Jules sessions and unblock them when necessary.',
  binding: 'JULES_OVERSEER',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'JulesOverseer',
    graphId: 'core-github-api-jules-overseer',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const JulesOverseerDurableObject = julesOverseerRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

// ─── JulesOverseer Durable Object ────────────────────────────────────────────

export class JulesOverseer extends JulesOverseerDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<PersistentAgentState>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.store = new AgentStateStore<PersistentAgentState>({
      ctx: state,
      env,
      agentName: 'JulesOverseer',
      initialState: { status: 'idle', history: [] },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/schedule/check') {
      return Response.json(await this.checkJulesStatus());
    }

    if (url.pathname === '/ingest' && request.method === 'POST') {
      try {
        const payload = await request.json<any>();
        if (payload.type === 'insight') {
          const db = getDb(this.env.DB);
          await db.insert(learningAiInsights).values({
            sessionId: payload.sessionId,
            patternType: payload.patternType || 'anti_pattern',
            title: payload.title || 'Ingested Insight',
            description: payload.description || '',
            severity: payload.severity ?? 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } else if (payload.type === 'agent_event') {
          this.store.logger.info('Agent event ingested:', payload);
        }
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }

    return super.fetch(request);
  }

  // ─── Main Monitoring Loop ──────────────────────────────────────────────────

  async detectAndIntervene(sessionId: string, snapshot: SnapshotActivity[], julesService: JulesService, db: any): Promise<boolean> {
    const messages = snapshot
      .filter((a) => a.type === 'agentMessaged' && a.message)
      .sort((a, b) => (a.timestamp ?? '') < (b.timestamp ?? '') ? 1 : -1)
      .slice(0, 10);

    if (messages[0]?.message?.startsWith('[SYSTEM OVERRIDE]')) {
      return false;
    }

    let matchCount = 0;
    for (const msg of messages) {
      if (msg.message && APOLOGY_PATTERNS.some(re => re.test(msg.message!))) {
        matchCount++;
      }
    }

    if (matchCount >= LOOP_THRESHOLD) {
      this.store.logger.warn(`Doom loop detected for session ${sessionId}. Intervening.`);

      await julesService.sendMessage(sessionId, OVERRIDE_MESSAGE);

      await db.insert(learningAiInsights).values({
      await db.insert(learningAiInsights).values({
        id: crypto.randomUUID(),
        sessionId,
        patternType: 'doom_loop',
        title: 'Doom Loop Detected',
        severity: 4,
        description: 'Circular apology loop detected',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Broadcast via JULES_WEBHOOK_BROADCASTER
      if ((this.env as any).JULES_WEBHOOK_BROADCASTER) {
        try {
          await (this.env as any).JULES_WEBHOOK_BROADCASTER.fetch('http://broadcaster/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'system_override', sessionId, reason: 'doom_loop_detected' }),
          });
        } catch (e) {
          this.store.logger.warn(`Failed to broadcast doom loop detection: ${(e as Error).message}`);
        }
      }

      return true; // Intervened
    }

    return false; // Did not intervene
  }

  async checkJulesStatus(): Promise<SessionCheckResult[]> {
    const db = getDb(this.env.DB);
    const julesService = JulesService.getInstance(this.env);
    const results: SessionCheckResult[] = [];

    await this.store.setStatus('running');

    const activeJobs = await db
      .select()
      .from(julesJobs)
      .where(notInArray(julesJobs.status, ['completed', 'failed']))
      .orderBy(desc(julesJobs.createdAt))
      .limit(20);

    this.store.logger.info(`Checking ${activeJobs.length} active jobs`);

    for (const job of activeJobs) {
      try {
        const session = await julesService.getSession(job.sessionId);

        let status = 'unknown';
        let info: any = null;

        try {
          info = await session.info();
          status = (info?.state ?? 'running') as string;
        } catch {
          status = 'running';
        }

        // Obtain a snapshot of recent activities for conditional analysis
        let snapshot: SnapshotActivity[] = [];
        try {
          const raw = await julesService.getSessionSnapshot(job.sessionId, { activities: true });
          snapshot = (raw as any)?.activities ?? [];
        } catch {
          // Non-fatal; snapshot may not always be available
        }

        const intervened = await this.detectAndIntervene(job.sessionId, snapshot, julesService, db);
        if (intervened) {
          results.push({ sessionId: job.sessionId, status: 'intervened', actionTaken: 'doom_loop_intervention' });
          continue; // Skip normal routing if we intervened
        }

        const result = await this.routeSessionState(job, status, info, snapshot, julesService);
        results.push(result);
      } catch (error: any) {
        this.store.logger.error(`Failed to inspect job ${job.id}`, { error: error.message });
        results.push({ sessionId: job.sessionId, status: 'error', actionTaken: 'error' });
      }
    }

    await this.store.set({ ...this.store.state, status: 'completed', lastResult: results });
    return results;
  }

  // ─── State Router ──────────────────────────────────────────────────────────

  private async routeSessionState(
    job: any,
    status: string,
    info: any,
    snapshot: SnapshotActivity[],
    julesService: JulesService,
  ): Promise<SessionCheckResult> {
    const db = getDb(this.env.DB);

    switch (status) {
      // ── Plan needs approval ────────────────────────────────────────────────
      case 'AWAITING_PLAN_APPROVAL':
      case 'awaitingPlanApproval':
        return this.handlePlanApproval(job, julesService, db);

      // ── Jules has a question or is paused ─────────────────────────────────
      case 'AWAITING_USER_FEEDBACK':
      case 'awaitingUserFeedback':
      case 'waiting_for_user':
        return this.handleUserFeedback(job, snapshot, info, julesService, db);

      // ── Something went wrong ───────────────────────────────────────────────
      case 'PAUSED':
      case 'FAILED':
      case 'failed':
        return this.handleBlockedSession(job, snapshot, info, julesService, db);

      // ── Done! ─────────────────────────────────────────────────────────────
      case 'COMPLETED':
      case 'completed':
      case 'ready_for_pr':
        return this.handleCompletion(job, status, julesService, db);

      // ── In progress: check if CI is failing ───────────────────────────────
      case 'IN_PROGRESS':
      case 'in_progress':
      default:
        if (snapshotIndicatesCIFailure(snapshot)) {
          return this.handleCIFailure(job, snapshot, info, julesService, db);
        }
        this.store.logger.info(`Session ${job.sessionId} is running normally.`);
        return { sessionId: job.sessionId, status, actionTaken: 'monitoring' };
    }
  }

  // ─── Conditional Handlers ─────────────────────────────────────────────────

  /**
   * Jules mapped out a plan and is waiting for approval. Auto-approve.
   */
  private async handlePlanApproval(job: any, julesService: JulesService, _db: any): Promise<SessionCheckResult> {
    this.store.logger.info(`Session ${job.sessionId}: auto-approving plan.`);
    const session = await julesService.getSession(job.sessionId);
    await (session as any).approve();
    return { sessionId: job.sessionId, status: 'AWAITING_PLAN_APPROVAL', actionTaken: 'plan_approved' };
  }

  /**
   * Jules has a question for the user. Use LLM to formulate a response
   * based on the latest agent message in the snapshot.
   */
  private async handleUserFeedback(
    job: any,
    snapshot: SnapshotActivity[],
    info: any,
    julesService: JulesService,
    db: any,
  ): Promise<SessionCheckResult> {
    this.store.logger.info(`Session ${job.sessionId}: unblocking via AI feedback.`);

    if (job.status !== 'blocked') {
      await db.update(julesJobs).set({ status: 'blocked' }).where(eq(julesJobs.id, job.id));
    }

    const feedback = await this.evaluateStuckJules({ snapshot, info });
    await julesService.sendMessage(job.sessionId, feedback);
    return { sessionId: job.sessionId, status: 'AWAITING_USER_FEEDBACK', actionTaken: 'unblocked_via_ai' };
  }

  /**
   * Session is PAUSED or FAILED. Use LLM to diagnose and recover.
   */
  private async handleBlockedSession(
    job: any,
    snapshot: SnapshotActivity[],
    info: any,
    julesService: JulesService,
    db: any,
  ): Promise<SessionCheckResult> {
    this.store.logger.info(`Session ${job.sessionId}: session is ${info?.state} — attempting recovery.`);

    if (job.status !== 'blocked') {
      await db.update(julesJobs).set({ status: 'blocked' }).where(eq(julesJobs.id, job.id));
    }

    const recovery = await this.evaluateStuckJules({ snapshot, info });
    await julesService.sendMessage(job.sessionId, recovery);
    return { sessionId: job.sessionId, status: info?.state ?? 'blocked', actionTaken: 'recovery_attempted' };
  }

  /**
   * Jules finished. Trigger PR submission and emit an alert for human review.
   */
  private async handleCompletion(
    job: any,
    status: string,
    julesService: JulesService,
    db: any,
  ): Promise<SessionCheckResult> {
    this.store.logger.info(`Session ${job.sessionId}: completed.`);

    if (status === 'ready_for_pr' || status === 'completed') {
      await julesService.sendMessage(
        job.sessionId,
        'The changes look good. Please proceed to submit the Pull Request.',
      );

      await db.insert(alerts).values({
        id: crypto.randomUUID(),
        title: 'Jules Remediation Completed',
        description: `Jules has finished the assigned task and submitted a PR for session ${job.sessionId}. Human review of the PR is recommended.`,
        process_origin: 'JulesOverseer',
        repo_origin: job.repoFullName,
        worker_origin: 'core-github-api',
        is_action_needed: true,
        action_required: 'Review generated Pull Request in GitHub',
      });
    }

    await db.update(julesJobs).set({ status: 'completed' }).where(eq(julesJobs.id, job.id));
    await db.update(julesSessions).set({ status: 'completed' }).where(eq(julesSessions.id, job.sessionId));
    return { sessionId: job.sessionId, status: 'completed', actionTaken: 'marked_completed' };
  }

  /**
   * CI failure detected in snapshot. Orchestration:
   * 1. Identify the failed Workers Build check run via GitHub API
   * 2. Fetch raw Cloudflare build logs
   * 3. Query Cloudflare Docs MCP for fix guidance
   * 4. Send Jules a targeted remediation prompt with full context
   */
  private async handleCIFailure(
    job: any,
    snapshot: SnapshotActivity[],
    info: any,
    julesService: JulesService,
    _db: any,
  ): Promise<SessionCheckResult> {
    this.store.logger.info(`Session ${job.sessionId}: CI failure detected — investigating build logs.`);

    // ── 1. Parse repo and PR from job metadata ─────────────────────────────
    const repoFullName: string = job.repoFullName ?? '';
    const [owner, repo] = repoFullName.split('/');
    const prUrl: string | null = info?.pullRequest?.url ?? null;
    const prNumber = extractPRNumber(prUrl);

    let buildLogs: string | null = null;
    let buildId: string | null = null;
    let checkRunName: string | null = null;

    if (owner && repo && prNumber) {
      try {
        // Resolve Cloudflare Secrets Store bindings (async)
        const [ghToken, cfToken, cfAccountId] = await Promise.all([
          this.env.GITHUB_PERSONAL_ACCESS_TOKEN.get(),
          this.env.CLOUDFLARE_API_TOKEN.get(),
          this.env.CLOUDFLARE_ACCOUNT_ID.get(),
        ]);

        const ciService = new CILogService({
          GITHUB_PERSONAL_ACCESS_TOKEN: ghToken,
          CLOUDFLARE_API_TOKEN: cfToken,
          CLOUDFLARE_ACCOUNT_ID: cfAccountId,
        });

        // ── 2. Find the failed Workers Build check run ─────────────────────
        const checkRuns = await ciService.getCheckRunsForPR(owner, repo, prNumber);
        const failedRun = ciService.findFailedWorkersBuildRun(checkRuns);

        if (failedRun) {
          checkRunName = failedRun.name;
          this.store.logger.info(`Found failed check run: ${failedRun.name} (id: ${failedRun.id})`);

          // ── 3. Fetch build logs ──────────────────────────────────────────
          const logResult = await ciService.getLogsForCheckRun(owner, repo, failedRun.id);
          buildId = logResult.buildId;
          buildLogs = logResult.logs;

          if (logResult.error) {
            this.store.logger.warn(`Could not fetch build logs: ${logResult.error}`);
          }
        } else {
          this.store.logger.warn(`No failed Workers Build check run found for PR #${prNumber}`);
        }
      } catch (err: any) {
        this.store.logger.error('CI log fetch failed', { error: err.message });
      }
    }

    // ── 4. Craft a targeted remediation prompt ─────────────────────────────
    const snapshotSummary = latestAgentMessage(snapshot) ?? 'No recent message found.';
    const remediation = await this.investigateCIFailure({
      sessionId: job.sessionId,
      repoFullName,
      prNumber,
      checkRunName,
      buildId,
      buildLogs,
      snapshotSummary,
    });

    // ── 5. Send Jules the remediation prompt ──────────────────────────────
    await julesService.sendMessage(job.sessionId, remediation);
    return { sessionId: job.sessionId, status: 'IN_PROGRESS', actionTaken: 'ci_failure_remediation_sent' };
  }

  // ─── AI Reasoning Helpers ─────────────────────────────────────────────────

  /**
   * LLM-driven reasoning: given Jules's stuck context, formulate next instructions.
   */
  private async evaluateStuckJules(julesContext: { snapshot: SnapshotActivity[]; info: any }): Promise<string> {
    const systemPrompt = `You are the Jules Overseer — an AI Engineering Manager supervising an async coding agent.
Jules is working on the repository and has become stuck. Your job:
1. Review Jules's current status and any error/roadblock they describe.
2. If Jules asks a yes/no progress question, respond affirmatively with specific direction.
3. If Jules is confused about Cloudflare-specific APIs, provide authoritative guidance.
4. If Jules says it is done or ready, instruct it to "Proceed to submit the Pull Request."`;

    const lastMessage = latestAgentMessage(julesContext.snapshot);
    const userPrompt = `Jules context:\n${JSON.stringify(julesContext.info, null, 2)}\n\nJules last said:\n${lastMessage ?? '(no message)'}`;

    const provider = resolveAgentProvider(this.env);
    const model = resolveAgentModel(this.env, provider);
    const julesService = JulesService.getInstance(this.env);

    const tools: AgentTool[] = [
      {
        name: 'get_session_snapshot',
        description: 'Get a point-in-time snapshot of the session history.',
        parameters: z.object({ sessionId: z.string() }),
        execute: async (args: Record<string, unknown>) => {
          try {
            return await julesService.getSessionSnapshot(String(args.sessionId ?? ''), { activities: false });
          } catch (error: any) {
            return { error: error.message };
          }
        },
      },
    ];

    try {
      return await runAgentText({
        env: this.env,
        logger: this.store.logger,
        name: 'JulesOverseer',
        instructions: systemPrompt,
        prompt: userPrompt,
        provider,
        model,
        tools,
      });
    } catch {
      return 'Please review your current approach, consult Cloudflare Worker documentation, and try an alternative implementation.';
    }
  }

  /**
   * LLM-driven reasoning: investigate a CI build failure and craft a remediation prompt.
   * Searches Cloudflare Docs for relevant fixes before composing the instruction.
   */
  private async investigateCIFailure(ctx: {
    sessionId: string;
    repoFullName: string;
    prNumber: number | null;
    checkRunName: string | null;
    buildId: string | null;
    buildLogs: string | null;
    snapshotSummary: string;
  }): Promise<string> {
    const systemPrompt = `You are the Jules Overseer — an AI Engineering Manager.
A Jules coding session on ${ctx.repoFullName} has a CI/CD failure on PR #${ctx.prNumber ?? 'unknown'}.
Your job:
1. Analyse the Cloudflare Workers build log provided.
2. Identify the root cause of the failure (e.g. missing binding, TypeScript error, bundle size, wrangler config issue).
3. Search Cloudflare docs if needed to confirm the correct fix.
4. Write a clear, step-by-step instruction for Jules explaining exactly what to change to fix the build.
5. Include the relevant portion of the build log in your response so Jules can see the specific error.
Keep your response concise and actionable. Do not repeat large sections of the log — extract only the relevant error lines.`;

    const truncatedLog = ctx.buildLogs
      ? ctx.buildLogs.slice(-6000) // last 6k chars is usually where the error is
      : '(no build logs available)';

    const userPrompt = `Jules's last snapshot message:\n${ctx.snapshotSummary}

Failed check run: ${ctx.checkRunName ?? 'Workers Builds (unknown)'}
Cloudflare Build ID: ${ctx.buildId ?? 'not found'}

--- BUILD LOG (tail) ---
${truncatedLog}
--- END LOG ---

Please diagnose this build failure and give Jules specific, actionable instructions to fix it.`;

    const provider = resolveAgentProvider(this.env);
    const model = resolveAgentModel(this.env, provider);

    // Tools available to the LLM during CI investigation
    const tools: AgentTool[] = [
      {
        name: 'search_cloudflare_docs',
        description: 'Search official Cloudflare documentation to find the correct fix for a Workers build error.',
        parameters: z.object({ query: z.string().describe('The error or topic to search for') }),
        execute: async (args: Record<string, unknown>) => {
          try {
            // Route through the Cloudflare docs MCP endpoint exposed on this worker
            const query = String(args.query ?? '');
            const docsUrl = `https://core-github-api.hacolby.workers.dev/api/cloudflare/docs/prompt`;
            const res = await fetch(docsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: query, maxResults: 5 }),
            });
            if (!res.ok) return { error: `Docs search failed: ${res.status}` };
            return await res.json();
          } catch (err: any) {
            return { error: err.message };
          }
        },
      },
    ];

    try {
      return await runAgentText({
        env: this.env,
        logger: this.store.logger,
        name: 'JulesOverseer::CIInvestigator',
        instructions: systemPrompt,
        prompt: userPrompt,
        provider,
        model,
        tools,
      });
    } catch (err: any) {
      this.store.logger.error('CI investigation LLM failed', { error: err.message });
      return `The CI build for PR #${ctx.prNumber} failed on check "${ctx.checkRunName}".
Build ID: ${ctx.buildId ?? 'unknown'}

Please review the following build log tail and fix the root cause:
\`\`\`
${truncatedLog.slice(-2000)}
\`\`\``;
    }
  }

  // ─── Dispatch Helpers ─────────────────────────────────────────────────────

  /**
   * Dispatches a Jules session to implement the full UI framework plan against
   * `targetRepo`. The jules_jobs row is inserted by dispatchUIFrameworkPlan, so
   * the next scheduled `checkJulesStatus()` run will automatically monitor and
   * submit the PR when Jules reports ready_for_pr.
   */
  async dispatchUIFrameworkPlan(
    targetRepo: string = 'jmbish04/core-template-cfw-assets-astro-shadcn',
  ): Promise<{ sessionId: string }> {
    this.store.logger.info(`Dispatching UIFramework plan to Jules for ${targetRepo}`);
    const result = await _dispatchUIFrameworkPlan(this.env, targetRepo);
    this.store.logger.info(`Jules UIFramework session created: ${result.sessionId}`);
    return result;
  }

  async scheduled(_event: ScheduledEvent) {
    this.store.logger.info('Running scheduled check...');
    await this.checkJulesStatus();
  }
}
