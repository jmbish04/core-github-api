/**
 * Jules Overseer Agent (Asynchronous Agent Manager)
 *
 * Monitors the lifecycle of long-running Jules (coding agent) sessions.
 * 1. Detects sessions inactive or stuck waiting for user input.
 * 2. Uses AI reasoning to evaluate the stuck state and provide autonomous guidance.
 * 3. Notifies humans of completed tasks or critical blockers via the Alerts system.
 * 4. Automatically triggers unblocking messages using the MCP-enabled BaseAgent foundation.
 * 5. Detects doom loops (apology spirals) and injects system override messages.
 * 6. Handles clarification requests from agents via /ingest.
 *
 * @module AI/Agents/JulesOverseer
 */
import { BaseAgent } from "./base/BaseAgent";
import { getDb } from "@db";
import { julesSessions, julesJobs } from "@db/schemas/jules";
import { alerts } from "@/db/schemas/app/alerts";
import { eq, notInArray, desc } from "drizzle-orm";
import { JulesService } from "@services/jules";
import { runTextAgent, resolveDefaultAiProvider, resolveDefaultAiModel } from "@/ai/agents/base/agent-ai";
import { z } from "zod";
import { learningAiInsights } from "@db/schemas/github/learning";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentEvent = {
  type: 'agent_message' | 'clarification_request' | 'session_start' | 'session_end';
  sessionId: string;
  content?: string;
  taskId?: string;
  question?: string;
  projectId?: string;
  agentId?: string;
  timestamp?: string;
};

type SessionCheckResult = {
  sessionId: string;
  status: string;
  actionTaken: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERRIDE_TEMPLATE = `[SYSTEM OVERRIDE]: You are stuck in a circular apology loop.

MANDATORY STEPS BEFORE YOUR NEXT PROPOSAL:
1. Stop repeating the same approach.
2. Review the exact error message carefully.
3. Search Cloudflare documentation for the specific API or binding causing the issue.
4. Propose a fundamentally different solution.

Continuing the same approach is prohibited.`;

/**
 * The JulesOverseer ensures autonomous progress for the Jules coding subsystem.
 */
export class JulesOverseer extends BaseAgent {
  // Check for sessions inactive for more than 1 hour
  private static STUCK_THRESHOLD_MS = 60 * 60 * 1000;

  // Doom-loop detection thresholds
  private static readonly LOOP_THRESHOLD = 3;
  private static readonly APOLOGY_PATTERNS: RegExp[] = [
    /i('m| am) sorry/i,
    /i apologize/i,
    /my (mistake|bad|fault)/i,
    /i('ve| have) been (making|repeating)/i,
    /same (approach|error|mistake)/i,
    /let me try (again|a different)/i,
    /i keep (making|repeating)/i,
    /once again.*apolog/i,
  ];

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ingest' && request.method === 'POST') {
      return this.handleIngest(request);
    }

    if (url.pathname === '/schedule/check') {
      await this.checkJulesStatus();
      return new Response('OK');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).__proto__.__proto__.fetch?.call(this, request) ?? new Response('Not found', { status: 404 });
  }

  // ---------------------------------------------------------------------------
  // Ingest: receives AgentEvent payloads from babysitter callbacks
  // ---------------------------------------------------------------------------

  private async handleIngest(request: Request): Promise<Response> {
    let event: AgentEvent;
    try {
      event = (await request.json()) as AgentEvent;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      switch (event.type) {
        case 'agent_message':
          await this.checkDoomLoop(event.sessionId, event.content ?? '');
          break;
        case 'clarification_request':
          await this.handleClarificationRequest(event);
          break;
        default:
          // session_start / session_end — log only
          this.logger.info(`[Ingest] ${event.type} for session ${event.sessionId}`);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      this.logger.error(`[Ingest] Error processing event`, { error: err.message });
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Doom-loop detection
  // ---------------------------------------------------------------------------

  async checkDoomLoop(sessionId: string, content: string): Promise<void> {
    const storageKey = `doom_loop:${sessionId}`;

    // Load, append, trim, save
    const stored = (await this.ctx.storage.get<string[]>(storageKey)) ?? [];
    stored.push(content);
    const recent = stored.slice(-10);
    await this.ctx.storage.put(storageKey, recent);

    // Count apology pattern matches across recent messages
    let matchCount = 0;
    for (const msg of recent) {
      for (const pattern of JulesOverseer.APOLOGY_PATTERNS) {
        if (pattern.test(msg)) {
          matchCount++;
          break; // only count each message once
        }
      }
    }

    if (matchCount >= JulesOverseer.LOOP_THRESHOLD) {
      this.logger.warn(`[DoomLoop] Session ${sessionId} has ${matchCount} apology patterns — injecting override`);

      // Send override to Jules
      try {
        const julesService = JulesService.getInstance(this.env);
        await julesService.sendMessage(sessionId, OVERRIDE_TEMPLATE);
      } catch (err: any) {
        this.logger.error(`[DoomLoop] Failed to send override for ${sessionId}`, { error: err.message });
      }

      // Insert learning insight
      try {
        const db = getDb(this.env.DB);
        await db.insert(learningAiInsights).values({
          id: crypto.randomUUID(),
          sessionId,
          patternType: 'doom_loop',
          title: `Apology loop detected in session ${sessionId}`,
          description: `${matchCount} apology pattern matches in last 10 messages`,
          severity: 4,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err: any) {
        this.logger.error(`[DoomLoop] Failed to persist insight for ${sessionId}`, { error: err.message });
      }

      // Reset the stored buffer so we don't re-trigger immediately
      await this.ctx.storage.put(storageKey, []);
    }
  }

  // ---------------------------------------------------------------------------
  // Clarification handling
  // ---------------------------------------------------------------------------

  private async handleClarificationRequest(event: AgentEvent): Promise<void> {
    const provider = resolveDefaultAiProvider(this.env);
    const model = resolveDefaultAiModel(this.env, provider);

    const answer = await runTextAgent({
      env: this.env,
      provider,
      model,
      name: 'JulesOverseer::Clarifier',
      instructions: 'You are a technical project orchestrator. Answer the agent\'s clarification question based on the project context. Be concise and specific.',
      input: event.question ?? 'No question provided.',
    });

    // Broadcast the answer via JulesWebhookBroadcaster
    const broadcasterId = this.env.JULES_WEBHOOK_BROADCASTER.idFromName('jules-broadcaster');
    const broadcaster = this.env.JULES_WEBHOOK_BROADCASTER.get(broadcasterId);
    await broadcaster.fetch('http://internal/internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clarification_response',
        taskId: event.taskId,
        sessionId: event.sessionId,
        projectId: event.projectId,
        answer,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  // ---------------------------------------------------------------------------
  // Core monitoring loop
  // ---------------------------------------------------------------------------

  /**
   * Core monitoring loop. Scans the database for active jobs and
   * inspects their status in the Jules service.
   */
  async checkJulesStatus(args?: any): Promise<SessionCheckResult[]> {
    const db = getDb(this.env.DB);
    const julesService = JulesService.getInstance(this.env);
    const results: SessionCheckResult[] = [];

    // 1. Find Pending/Blocked Jobs
    const activeJobs = await db.select()
      .from(julesJobs)
      .where(notInArray(julesJobs.status, ['completed', 'failed']))
      .orderBy(desc(julesJobs.createdAt))
      .limit(20);

    this.logger.info(`Checking ${activeJobs.length} active jobs`);

    for (const job of activeJobs) {
      try {
        const session = await julesService.getSession(job.sessionId);

        let status = 'unknown';
        let julesContext: any = null;

        try {
          // Fetch the status and history/info from Jules
          const info = await session.info();
          status = info.state || 'running';
          julesContext = info || 'No context available';
        } catch (e) {
          status = 'running';
        }

        if (status === 'completed' || status === 'failed' || status === 'ready_for_pr') {
          if (status === 'ready_for_pr' || status === 'completed') {
            // Tell Jules to wrap up
            await julesService.sendMessage(job.sessionId, "The changes look good. Please proceed to submit the Pull Request.");

            // Fire an Alert for human follow-up
            await db.insert(alerts).values({
              id: crypto.randomUUID(),
              title: "Jules Remediation Completed",
              description: `Jules has finished the assigned task and submitted a PR for session ${job.sessionId}. Human review of the PR is recommended.`,
              process_origin: "JulesOverseer",
              repo_origin: job.repoFullName,
              worker_origin: "core-github-api",
              is_action_needed: true,
              action_required: "Review generated Pull Request in GitHub"
            });
          }

          await db.update(julesJobs)
            .set({ status: 'completed' })
            .where(eq(julesJobs.id, job.id));
          await db.update(julesSessions)
            .set({ status: 'completed' })
            .where(eq(julesSessions.id, job.sessionId));

          results.push({ sessionId: job.sessionId, status, actionTaken: 'marked_completed' });

        } else if (status === 'waiting_for_user') {
          this.logger.info(`Session ${job.sessionId} is stuck. Booting AI Manager...`);

          // Update job to blocked so UI reflects it
          if (job.status !== 'blocked') {
            await db.update(julesJobs)
              .set({ status: 'blocked' })
              .where(eq(julesJobs.id, job.id));
          }

          // Run AI Manager to unblock Jules utilizing BaseAgent's native MCP integration
          const instructions = await this.evaluateStuckJules(julesContext);

          // Send the unblocking instructions back to Jules
          await julesService.sendMessage(job.sessionId, instructions);

          results.push({ sessionId: job.sessionId, status, actionTaken: 'unblocked_via_ai' });
        } else {
          results.push({ sessionId: job.sessionId, status, actionTaken: 'monitoring' });
        }

      } catch (err: any) {
        this.logger.error(`Failed to inspect job ${job.id}`, { error: err.message });
        results.push({ sessionId: job.sessionId, status: 'error', actionTaken: 'error' });
      }
    }

    return results;
  }

  async scheduled(event: ScheduledEvent) {
    this.logger.info("Running scheduled check...");
    await this.checkJulesStatus();
  }

  /**
   * AI-powered stuck session evaluator.
   * Leverages high-reasoning models and MCP tools to understand why
   * a session is stuck and generate authoritative remediation instructions.
   */
  private async evaluateStuckJules(julesContext: any): Promise<string> {
    const systemPrompt = `You are the Jules Overseer, an AI Engineering Manager overseeing an asynchronous coding agent named Jules.
Jules is currently working on the repository \`jmbish04/core-github-api\` but has become stuck and is waiting for your instructions.

YOUR DIRECTIVE:
1. Review Jules's current status and the error/roadblock they are facing.
2. If Jules is confused about Cloudflare-specific implementations (e.g., Workers, D1, KV, bindings), provide authoritative guidance.
3. Formulate a clear, authoritative, and step-by-step response to unblock Jules and guide it toward the correct implementation.
4. If Jules reports that the code is complete and asks for review/approval, explicitly instruct Jules to "Proceed to submit the Pull Request."`;

    const userPrompt = `Jules is stuck. Here is their current context and last message: \n${JSON.stringify(julesContext, null, 2)}`;

    try {
      const julesService = JulesService.getInstance(this.env);
      const provider = this.resolveProvider();
      const model = this.resolveModel(provider);

      return await this.runTextWithModel({
        name: "JulesOverseer",
        instructions: systemPrompt,
        prompt: userPrompt,
        provider,
        model,
        tools: [
          {
            name: "get_session_info",
            description: "Get detailed information about a Jules session to understand why it is stuck.",
            parameters: z.object({ sessionId: z.string() }) as any,
            execute: async ({ sessionId }: { sessionId: string }) => {
              try {
                const session = await julesService.getSession(sessionId);
                return await session.info();
              } catch (e: any) {
                return { error: e.message };
              }
            }
          },
          {
            name: "get_session_snapshot",
            description: "Get a point-in-time snapshot of the session including the full filesystem state and history.",
            parameters: z.object({ sessionId: z.string() }) as any,
            execute: async ({ sessionId }: { sessionId: string }) => {
              try {
                return await julesService.getSessionSnapshot(sessionId, { includeActivities: false });
              } catch (e: any) {
                return { error: e.message };
              }
            }
          }
        ]
      });
    } catch (error) {
      this.logger.error("Failed to evaluate stuck Jules session", { error });
      return "Please review the files, consult standard Cloudflare Worker documentation, and try an alternative approach.";
    }
  }
}
