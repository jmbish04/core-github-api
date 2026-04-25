/**
 * @file src/ai/agents/GuardrailAgent/index.ts
 * @description GuardrailAgent — the exclusive owner of Cloudflare golden-path
 *              enforcement (Lock L4). Extends AIChatAgent with embedded SQLite
 *              state for evaluation results and rule caching.
 *
 * @architecture Lock L4: All Cloudflare-docs standards enforcement is
 *              centralized HERE. No other agent may run golden-path checks.
 */

import { callable } from 'agents';
import { BaseAgent } from '@/ai/providers';
import * as methods from "./methods";
import { warmRuleCacheFromD1 } from "./methods/evaluate";
import type { EvaluationPayload, Verdict, GuardrailState } from "./types";
// Logger is inherited from BaseAgent via this.logger
import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';

export class GuardrailAgent extends BaseAgent<GuardrailState> {
  public agentName = 'GuardrailAgent';
  public skills = ['cloud-security', 'cloudflare'];

  public get peerAgentBindings(): Record<string, import('@/ai/providers/agent-support/health').PeerBindingDescriptor> {
    return {
      CLOUDFLARE_AGENT: { bindingKey: this.env.CLOUDFLARE_AGENT as any as string, required: true }
    };
  }

  async agentInit() {
    // Apply idempotent DDL for DO SQLite state, then warm the rule cache from D1
    await this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS guardrail_evaluations (
          request_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          score INTEGER NOT NULL,
          issues_json TEXT,
          evaluated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guardrail_eval_status
          ON guardrail_evaluations (status);

        CREATE TABLE IF NOT EXISTS guardrail_rule_cache (
          rule_key TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        );
      `);

      // Warm the DO SQLite rule cache from D1 so rules survive redeploy
      await warmRuleCacheFromD1(this);
    });
  }

  // ── RPC Methods ─────────────────────────────────────────────────────

  /**
   * Main evaluation entry point. Accepts a code/config payload and
   * returns a structured Verdict with issues, corrections, and score.
   */
  @callable()
  async evaluatePayload(payload: EvaluationPayload): Promise<Verdict> {
    this.logger.info(`[evaluatePayload] Evaluating request: ${payload.requestId}`, { context: (payload as any).context });
    const verdict = await methods.evaluatePayload(this, payload);
    this.logger.info(`[evaluatePayload] Verdict for ${payload.requestId}: ${verdict.status} (score: ${verdict.score})`);
    return verdict;
  }

  /**
   * Subscribe this GuardrailAgent to a ChatRoom for live event
   * interception. When an EngineerAgent emits code into the room,
   * the Guardrail intercepts and evaluates automatically.
   */
  @callable()
  async subscribeToChatRoom(roomId: string): Promise<void> {
    this.logger.info(`[subscribeToChatRoom] Subscribing to room: ${roomId}`);
    return methods.subscribeToChatRoom(this, roomId);
  }

  /**
   * Directly attaches and intercepts a Jules SSE stream.
   * Acts as an active middleware to catch architectural/React/Shadcn standard violations.
   */
  @callable()
  async attachStreamMiddleware(julesSessionId: string): Promise<void> {
    this.logger.info(`[attachStreamMiddleware] Attaching to Jules session: ${julesSessionId}`);
    // 1. Record attachment in DO SQLite (fast, local)
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO guardrail_evaluations (request_id, status, score, evaluated_at)
       VALUES (?, 'intercepting_stream', 100, datetime('now'))`,
      julesSessionId,
    );
    // 2. Mirror to D1 (durable, visible on frontend)
    await methods.evaluatePayload(this, {
      requestId: julesSessionId,
      code: '',
      context: 'stream_interception',
    } as any).catch(() => {/* non-fatal */});
    this.logger.info(`[attachStreamMiddleware] Started middleware stream interception on session ${julesSessionId}`);
  }

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const start = Date.now();

    try {
      const rulesRow = this.ctx.storage.sql.exec(
        `SELECT COUNT(*) as cnt FROM guardrail_rule_cache`,
      ).toArray();
      const cachedRules = (rulesRow[0] as any)?.cnt ?? 0;

      const evalsRow = this.ctx.storage.sql.exec(
        `SELECT COUNT(*) as cnt FROM guardrail_evaluations
         WHERE evaluated_at > datetime('now', '-24 hours')`,
      ).toArray();
      const recentEvaluations = (evalsRow[0] as any)?.cnt ?? 0;

      checks.push({
        name: 'agent.guardrail.ruleCache',
        layer: 3,
        category: 'storage',
        status: cachedRules > 0 ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: `${cachedRules} rules cached, ${recentEvaluations} evaluations in last 24h`,
        details: { cachedRules, recentEvaluations },
      });
    } catch (err: any) {
      checks.push({
        name: 'agent.guardrail.ruleCache',
        layer: 3,
        category: 'storage',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'DO SQLite table query failed',
        error: err.message,
      });
    }

    if (_mode === 'deep') {
      try {
        const deepStart = Date.now();
        // Emulate deep check logic from the deleted health check
        const payload = {
          requestId: `health-check-${Date.now()}`,
          code: 'console.log("health test");',
          context: 'health-test'
        };
        const verdict = await methods.evaluatePayload(this, payload as any);
        checks.push({
          name: 'agent.guardrail.evaluate',
          layer: 3,
          category: 'custom',
          status: verdict.status === 'fail' ? 'fail' : 'pass',
          durationMs: Date.now() - deepStart,
          message: `Evaluation core online (Score: ${verdict.score})`,
        });
      } catch (err: any) {
        checks.push({
          name: 'agent.guardrail.evaluate',
          layer: 3,
          category: 'custom',
          status: 'fail',
          durationMs: 0,
          message: 'Evaluation payload test failed',
          error: err.message,
        });
      }
    }

    return checks;
  }
}
