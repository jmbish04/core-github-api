/**
 * @file src/ai/agents/EngineerAgent/index.ts
 * @description EngineerAgent — manages SWE Fleet dispatch, Jules sessions,
 *              Stitch builds, milestone tracking, and Guardrail integration.
 *              Extends AIChatAgent with embedded DO SQLite for fleet/milestone state.
 */

import { callable } from "agents";
import { BaseThinkAgent } from "@/ai/providers/agent-support";
import * as methods from "./methods";
import type { EngineerState, Sprint, BrainEvaluation, MilestoneEvent } from "./types";
import type { Verdict } from "../GuardrailAgent/types";
import { migrateEngineerDb, getEngineerDb, type EngineerDb } from "@db/schemas/agents/software/stateful";
// Logger is inherited from BaseAgent via this.logger
import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';
import { experimentalCodemodeOrchestrateImpl } from './methods/experimental-codemode';

export class EngineerAgent extends BaseThinkAgent<EngineerState> {
  // We no longer need `public ai!` as it's inherited
  public db!: EngineerDb;
  public agentName = "EngineerAgent";
  public skills = ['engineering', 'jules-orchestration', 'code-review'];

  async agentInit() {
    await super.agentInit();

    // Apply idempotent DDL for DO SQLite state
    (this as any).ctx.blockConcurrencyWhile(async () => {
      migrateEngineerDb((this as any).ctx.storage);
      this.db = getEngineerDb((this as any).ctx.storage);
    });

    // Eviction recovery: if the DO was evicted, restore state from D1
    await this.recoverFromD1();
  }

  /**
   * Recover fleet session state from D1 after DO eviction.
   * Reads from the agentStateMirror table and replays into DO SQLite.
   */
  private async recoverFromD1(): Promise<void> {
    const logPrefix = "[recoverFromD1]";

    try {
      const agentId = (this as any).ctx.id.toString();
      const existingSessions = (this as any).ctx.storage.sql.exec(
        `SELECT COUNT(*) as cnt FROM swe_fleet_sessions`,
      ).toArray();

      if ((existingSessions[0] as any)?.cnt > 0) return; // Already has state

      // Check D1 for persisted state
      const { getDb } = await import("@db");
      const d1 = getDb((this as any).env.DB);
      const { agentStateMirror } = await import("@db/schemas/agents/mirror");
      const { eq } = await import("drizzle-orm");

      const mirror = await d1
        .select()
        .from(agentStateMirror)
        .where(eq(agentStateMirror.agentId, agentId))
        .limit(1);

      if (mirror.length > 0 && mirror[0].stateJson) {
        const state = JSON.parse(mirror[0].stateJson) as EngineerState;
        this.logger.info(`${logPrefix} Recovered state from D1 mirror for ${agentId}`);
        // Replay fleet sessions into DO SQLite
        for (const [id, record] of Object.entries(state.fleetStatus || {})) {
          (this as any).ctx.storage.sql.exec(
            `INSERT OR IGNORE INTO swe_fleet_sessions (id, request_id, role, status, created_at, updated_at)
             VALUES (?, '', ?, ?, strftime('%s','now'), strftime('%s','now'))`,
            id,
            "solo",
            record.status,
          );
        }
      }
    } catch (err: any) {
      // Non-fatal — first run or D1 unavailable
      this.logger.warn(`${logPrefix} D1 recovery skipped: ${String(err)}`);
    }
  }

  // ── Session Configuration ─────────────────────────────────────────────

  protected override configureSession(session: any): void {
    super.configureSession(session);
    
    // Inject codemode tool if enabled
    if ((this as any).env.CODEMODE_ENABLED === '1') {
      import('@/ai/tools/codemode-tool').then(({ createCodeTool }) => {
        session.tools.push(createCodeTool((this as any).env));
        this.logger.info(`[configureSession] Injected CodeMode tool`);
      }).catch(err => {
        this.logger.error(`[configureSession] Failed to load codemode tool: ${err.message}`);
      });
    }
  }

  // ── RPC Methods ─────────────────────────────────────────────────────

  /**
   * Assign a sprint to this EngineerAgent. Triggers brain evaluation
   * to determine the execution strategy, then dispatches accordingly.
   */
  @callable()
  async assignSprint(sprint: Sprint) {
    this.logger.info(`[assignSprint] Assigning sprint: ${sprint.title} (${sprint.subtasks.length} subtasks)`);
    const evaluation = await methods.evaluateSprint(
      this,
      sprint.title,
      sprint.subtasks.map((s) => s.description).join("\n"),
      sprint.subtasks.flatMap((s) => s.files || []),
    );

    // Update sprint with brain's subtask decomposition
    sprint.subtasks = evaluation.subtasks.map((st) => ({
      ...st,
      status: "pending" as const,
    }));

    // Track in DO SQLite
    for (const subtask of sprint.subtasks) {
      (this as any).ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO swe_fleet_sessions (id, request_id, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', strftime('%s','now'), strftime('%s','now'))`,
        subtask.id,
        sprint.requestId,
        subtask.role,
      );
    }

    this.logger.info(`[assignSprint] Sprint assigned — ${sprint.subtasks.length} subtasks tracked`);
    return { success: true, evaluation, sprint };
  }

  /**
   * Streaming variant of assignSprint — sends real-time fleet dispatch
   * progress events via @callable SSE streaming.
   *
   * Client usage: agent.call("streamFleetProgress", [sprint], { stream: { onChunk } })
   */
  @callable({ streaming: true })
  async streamFleetProgress(stream: import('agents').StreamingResponse, sprint: Sprint) {
    this.logger.info(`[streamFleetProgress] Streaming sprint: ${sprint.title}`);
    stream.send({ type: 'fleet:evaluating', title: sprint.title, timestamp: Date.now() });

    const evaluation = await methods.evaluateSprint(
      this,
      sprint.title,
      sprint.subtasks.map((s) => s.description).join("\n"),
      sprint.subtasks.flatMap((s) => s.files || []),
    );

    stream.send({ type: 'fleet:evaluated', decision: evaluation.decision, subtaskCount: evaluation.subtasks.length, timestamp: Date.now() });

    sprint.subtasks = evaluation.subtasks.map((st) => ({
      ...st,
      status: "pending" as const,
    }));

    for (const subtask of sprint.subtasks) {
      (this as any).ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO swe_fleet_sessions (id, request_id, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', strftime('%s','now'), strftime('%s','now'))`,
        subtask.id,
        sprint.requestId,
        subtask.role,
      );
      stream.send({ type: 'fleet:subtask_tracked', subtaskId: subtask.id, role: subtask.role, timestamp: Date.now() });
    }

    stream.end({ type: 'fleet:complete', subtaskCount: sprint.subtasks.length, timestamp: Date.now() });
  }

  /**
   * Evaluate a sprint without dispatching — inspect what the brain would do.
   */
  @callable()
  async evaluateSprint(title: string, description: string, files?: string[]): Promise<BrainEvaluation> {
    this.logger.info(`[evaluateSprint] Evaluating: ${title}`, { fileCount: files?.length });
    return methods.evaluateSprint(this, title, description, files);
  }

  /**
   * Event sink for Jules session status changes.
   */
  @callable()
  async onJulesStatusChange(sessionId: string, status: string, payload: any) {
    this.logger.info(`[onJulesStatusChange] Session ${sessionId} → ${status}`);
    return methods.handleJulesEvent(this, sessionId, status, payload);
  }

  /**
   * Emit a milestone event via ChatRoom (Lock L3).
   */
  @callable()
  async emitMilestone(event: MilestoneEvent): Promise<void> {
    this.logger.info(`[emitMilestone] ${event.name}: ${JSON.stringify(event).slice(0, 120)}`);
    return methods.emitMilestone(this, event);
  }

  /**
   * Run a guardrail check against code files.
   */
  @callable()
  async runGuardrailCheck(
    requestId: string,
    files: Array<{ path: string; content: string; language?: string }>,
  ): Promise<Verdict> {
    this.logger.info(`[runGuardrailCheck] request=${requestId}, ${files.length} files`);
    return methods.runGuardrailCheck(this, requestId, files);
  }

  /**
   * Digests raw Stitch HTML output into a dense Markdown UX Brief for Jules.
   * This is critical to prevent passing raw HTML to Jules.
   */
  @callable()
  async digestStitchHtmlToMarkdown(htmlCode: string): Promise<string> {
    const { JulesService } = await import("@/services/jules");
    const julesService = JulesService.getInstance((this as any).env);
    
    this.logger.info(`[digestStitchHtmlToMarkdown] Digesting Stitch HTML (${htmlCode.length} chars) to Markdown`);
    const { agentMessage } = await julesService.runRepolessSession(
      `You are a UI Engineer converting raw Stitch generation output into actionable specs. 
        Digest this raw HTML layout into a compact Markdown UX brief describing the exact UI hierarchy, semantics, classes, and typography. 
        Do not output raw HTML inside the brief.\n\nHTML:\n${htmlCode}`
    );
    
    this.logger.info(`[digestStitchHtmlToMarkdown] Brief generated (${agentMessage?.length ?? 0} chars)`);
    return agentMessage || "No brief generated.";
  }

  /**
   * Initializes a Jules execution session and pipes the SSE stream through the GuardrailAgent middleware.
   */
  @callable()
  async initializeAndPipeJulesSession(prompt: string, htmlUXBrief: string, repoContext: any): Promise<any> {
    const fullPrompt = `${prompt}\n\n## UX Brief (From Stitch Design):\n${htmlUXBrief}`;
    const { JulesSessionBuilder } = await import("@/services/jules/builder");
    const builder = new JulesSessionBuilder((this as any).env)
      .withPrompt(fullPrompt)
      .withRepo(repoContext.owner, repoContext.name)
      .withoutApproval();

    return (this as any).keepAliveWhile(async () => {
      const session = await builder.start();

      // Call GuardrailAgent active middleware
      const { getAgentByName } = await import("agents");
      const guardrail = getAgentByName((this as any).env.GUARDRAIL_AGENT as any, "singleton");
      await (guardrail as any).attachStreamMiddleware(session.id);

      return { sessionId: session.id, status: "active" };
    });
  }

  /**
   * Evaluate active Jules sessions for inactivity, blockages, or context-needs.
   * Absorbed from legacy OverseerAgent.
   */
  @callable()
  async checkSchedule(): Promise<{ checked: number }> {
    this.logger.info('[checkSchedule] Evaluating active Jules sessions');
    return methods.checkSchedule(this as any);
  }

  /**
   * Accept structured event payloads from other agents for AI-assisted handling.
   * Absorbed from legacy OverseerAgent.
   */
  @callable()
  async ingestEvent(event: any): Promise<void> {
    this.logger.info(`[ingestEvent] Ingesting event: ${event?.type ?? 'unknown'}`);
    return methods.ingestEvent(this as any, event);
  }

  /**
   * Resolve merge conflicts on a PR using the full Sandbox pipeline.
   * Callable via chat ("@colby merge conflicts"), GitHub comment, or REST API.
   *
   * Pipeline: clone → merge → detectConflicts → opencode → AI fallback → commit+push
   */
  @callable()
  async resolveConflicts(opts: {
    owner: string;
    repo: string;
    prNumber: number;
    headBranch: string;
    baseBranch: string;
    sessionId?: string;
    operationId?: string;
    skipOpencode?: boolean;
  }) {
    this.logger.info(`[resolveConflicts] Starting conflict resolution for ${opts.owner}/${opts.repo}#${opts.prNumber}`, { head: opts.headBranch, base: opts.baseBranch });
    const { resolveConflicts: runPipeline } = await import("./methods/sandbox/git/conflicts/resolveConflicts");
    return runPipeline((this as any).env, opts);
  }

  /**
   * Executes a strictly read-only codemode orchestration pass.
   * @beta Experimental feature. Refer to docs/new_agents_sdk/codemode.md.
   * Note: Codemode has severe footgun risks if mutated. This only mounts safe tools.
   */
  @callable()
  async experimentalCodemodeOrchestrate(args: any) {
    this.logger.info(`[experimentalCodemodeOrchestrate] Starting codemode orchestrate stub`);
    return experimentalCodemodeOrchestrateImpl(this, args);
  }

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const start = Date.now();

    try {
      const row = (this as any).ctx.storage.sql.exec(
        `SELECT COUNT(*) as cnt FROM swe_fleet_sessions WHERE status = 'active'`,
      ).toArray();
      const activeSessions = (row[0] as any)?.cnt ?? 0;

      checks.push({
        name: 'agent.engineer.fleetSessions',
        layer: 3,
        category: 'storage',
        status: 'pass',
        durationMs: Date.now() - start,
        message: `${activeSessions} active fleet sessions`,
        details: { activeSessions },
      });
    } catch (err: any) {
      checks.push({
        name: 'agent.engineer.fleetSessions',
        layer: 3,
        category: 'storage',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'Fleet sessions table query failed',
        error: err.message,
      });
    }

    return checks;
  }
}
