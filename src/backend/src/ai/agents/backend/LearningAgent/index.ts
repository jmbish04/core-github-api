/**
 * @file ai/agents/LearningAgent/index.ts
 * @description Agent responsible for fleet-wide meta-learning:
 *
 *  - Observes health failures, build errors, runtime errors, and chat-corrections
 *    across ANY worker in the fleet (not just core-github-api).
 *  - Correlates repeated failure patterns via `fleet_observations` table.
 *  - Ingests repeated human corrections from peer agents and auto-promotes
 *    to HITL queue when recurrence threshold is crossed.
 *  - Routes approved proposals to the correct target repo:
 *    template-repo, guardrail-rules, core-github-api, or worker-specific.
 *
 * Key @callable() methods:
 *  - queueForApproval     — Queue a build analysis for HITL review
 *  - approve/reject       — Frontend-driven approve/reject decisions
 *  - diagnoseFleetFailure — Fleet-wide health diagnosis (any worker)
 *  - observeChatCorrection — Ingestion from peer agents detecting repeated user corrections
 *  - listFleetObservations — Paginated dashboard query
 *  - promoteToHitl        — Manual escalation path
 *
 * Routes (via onRequest fallback):
 *  GET  /health                → healthProbe()
 *  POST /queue                 → Queue a new build analysis for HITL review
 *  GET  /pending               → List all pending approvals
 *  POST /approve/:id           → Approve a queued item
 *  POST /reject/:id            → Reject a queued item
 *  POST /retry/:id             → Re-trigger a workflow for an expired item
 *  POST /diagnose              → Fleet-wide health diagnosis
 *  POST /observe-correction    → Ingest a chat correction
 *  GET  /fleet-observations    → List fleet observations (with filters)
 *  POST /promote/:id           → Manually promote observation to HITL
 *
 * @module AI/Agents/LearningAgent
 */

import { callable } from "agents";
import { BaseAgent, type PersistentAgentState } from "@/ai/providers";
import { HitlQueue } from "@/ai/providers/agent-support/hitl-queue";
import { getDb } from "@db";
import { fleetObservations } from "@db/schemas/agents/fleet-observations";
import { eq, sql } from "drizzle-orm";

import * as methods from "./methods";
import type {
  QueueBuildAnalysisPayload,
  ApprovalResult,
  FleetDiagnoseInput,
  ChatCorrectionInput,
  FleetObservationFilter,
  ProposalTarget,
} from "./types";

export class LearningAgent extends BaseAgent<PersistentAgentState> {
  public agentName = 'LearningAgent';
  public skills = ['continuous-learning', 'architecture'];

  initialState: PersistentAgentState = {
    status: 'idle',
    history: []
  };

  public get peerAgentBindings(): Record<string, import('@/ai/providers/agent-support/health').PeerBindingDescriptor> {
    return {
      GITHUB_AGENT: { bindingKey: 'GITHUB_AGENT', required: true },
      CLOUDFLARE_AGENT: { bindingKey: 'CLOUDFLARE_AGENT', required: false },
      ENGINEER_AGENT: { bindingKey: 'ENGINEER_AGENT', required: true },
      GUARDRAIL_AGENT: { bindingKey: 'GUARDRAIL_AGENT', required: false },
    };
  }

  async agentInit() {
    // Initialization handled by BaseAgent
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.logger.info(`[onRequest] ${request.method} ${url.pathname}`);

    // Try agent-specific routes first
    const methodsRes = await methods.onRequest(this, request);
    if (methodsRes.status !== 404) return methodsRes;

    // Fall through to BaseAgent.onRequest for /stream and SDK routing
    return super.onRequest(request);
  }

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(_mode: import('@/ai/providers/agent-support/health').HealthMode): Promise<import('@/ai/providers/agent-support/health').HealthCheck[]> {
    const checks: import('@/ai/providers/agent-support/health').HealthCheck[] = [];

    // Verify fleet_observations table is queryable
    try {
      const start = Date.now();
      const db = getDb(this.env.DB);
      await db.select({ count: sql<number>`COUNT(*)` }).from(fleetObservations);
      checks.push({
        name: 'agent.fleetObservations.queryable',
        layer: 3,
        category: 'custom',
        status: 'pass',
        durationMs: Date.now() - start,
        message: 'fleet_observations table is queryable',
      });
    } catch (err: any) {
      checks.push({
        name: 'agent.fleetObservations.queryable',
        layer: 3,
        category: 'custom',
        status: 'fail',
        durationMs: 0,
        message: 'fleet_observations table not queryable',
        error: err.message,
      });
    }

    if (_mode === 'deep') {
      try {
        const deepStart = Date.now();
        // Emulate deep check logic from the deleted health check by doing a dry-run or verification
        await this.listFleetObservations({ limit: 1 });
        checks.push({
          name: 'agent.learning.endpoints',
          layer: 3,
          category: 'custom',
          status: 'pass',
          durationMs: Date.now() - deepStart,
          message: 'Learning agent core RPC methods online',
        });
      } catch (err: any) {
        checks.push({
          name: 'agent.learning.endpoints',
          layer: 3,
          category: 'custom',
          status: 'fail',
          durationMs: 0,
          message: 'Learning agent core RPC methods failed',
          error: err.message,
        });
      }
    }

    return checks;
  }

  // ── Existing @callable() — Build Analysis HITL ───────────────────────

  @callable()
  async queueForApproval(payload: QueueBuildAnalysisPayload): Promise<string> {
    this.logger.info('[queueForApproval] Queuing build analysis for HITL review', { repoId: (payload as any).repoId });
    return methods.queueForApproval(this, payload);
  }

  @callable()
  async approve(approvalId: string, userId: string, feedback?: string): Promise<ApprovalResult> {
    this.logger.info(`[approve] Approving ${approvalId} by user ${userId}`, { hasFeedback: !!feedback });
    return methods.approve(this, approvalId, userId, feedback);
  }

  @callable()
  async reject(approvalId: string, reason: string): Promise<ApprovalResult> {
    this.logger.info(`[reject] Rejecting ${approvalId}`, { reason });
    return methods.reject(this, approvalId, reason);
  }

  @callable()
  async approveAction(hitlRecordId: string, humanFeedback?: string) {
    this.logger.info(`[approveAction] Approving HITL action: ${hitlRecordId}`, { hasFeedback: !!humanFeedback });
    return methods.approveAction(this, hitlRecordId, humanFeedback);
  }

  @callable()
  async rejectAction(hitlRecordId: string, reason?: string) {
    this.logger.info(`[rejectAction] Rejecting HITL action: ${hitlRecordId}`, { reason });
    return methods.rejectAction(this, hitlRecordId, reason);
  }

  @callable()
  async dispatchApprovedAction(hitlRecord: any) {
    this.logger.info(`[dispatchApprovedAction] Dispatching approved action: ${hitlRecord?.id ?? 'unknown'}`);
    return methods.dispatchApprovedAction(this, hitlRecord);
  }

  @callable()
  async retryExpired(originalApprovalId: string): Promise<string> {
    this.logger.info(`[retryExpired] Retrying expired approval: ${originalApprovalId}`);
    return methods.retryExpired(this, originalApprovalId);
  }

  // ── Fleet-Wide @callable() — v7 ─────────────────────────────────────

  /**
   * Fleet-wide health diagnosis. Accepts any worker as a target.
   * Records the failure in fleet_observations for recurrence tracking.
   */
  @callable()
  async diagnoseFleetFailure(input: FleetDiagnoseInput) {
    this.logger.info('[diagnoseFleetFailure] Diagnosing fleet failure', {
      worker: input.target.workerName,
      source: input.source,
      failureType: input.failure.type,
    });
    return methods.diagnoseHealthFailure(
      { ai: this.ai, env: this.env as any, agent: this as any },
      input,
    );
  }

  /**
   * Ingestion endpoint for repeated user corrections from peer agents.
   * Other agents call this via getPeerAgent('LEARNING_AGENT').observeChatCorrection().
   */
  @callable()
  async observeChatCorrection(input: ChatCorrectionInput) {
    this.logger.info('[observeChatCorrection] Received chat correction', {
      worker: input.target.workerName,
      sourceAgent: input.sourceAgent,
    });
    return methods.observeChatCorrection(this, input);
  }

  /**
   * Paginated query over fleet observations for the frontend dashboard.
   */
  @callable()
  async listFleetObservations(filter: FleetObservationFilter) {
    this.logger.info('[listFleetObservations] Querying fleet observations', { filter });
    return methods.listFleetObservations(this, filter);
  }

  /**
   * Manual escalation path: promote a fleet observation to the HITL queue.
   */
  @callable()
  async promoteToHitl(observationId: string, target: ProposalTarget = 'template-repo') {
    this.logger.info('[promoteToHitl] Manual HITL promotion', { observationId, target });

    const db = getDb(this.env.DB);
    const observations = await db
      .select()
      .from(fleetObservations)
      .where(eq(fleetObservations.id, observationId))
      .limit(1);

    if (!observations.length) {
      throw new Error(`Fleet observation not found: ${observationId}`);
    }

    const obs = observations[0];
    if (obs.hitlPromoted === 1) {
      return { success: false, reason: 'Already promoted', hitlRecordId: obs.hitlRecordId };
    }

    const hitl = new HitlQueue(this.env as any);
    const hitlRecordId = await hitl.propose({
      workflowId: `fleet-manual-${observationId}`,
      category: 'fleet_observation',
      entityId: observationId,
      proposedPayload: {
        failureMessage: obs.failureMessage,
        workerName: obs.workerName,
        repoOwner: obs.repoOwner,
        repoName: obs.repoName,
        recurrenceCount: obs.recurrenceCount,
      },
      contextMetadata: {
        manualPromotion: true,
        promotedAt: new Date().toISOString(),
      },
      proposalTarget: target,
      targetWorkerName: obs.workerName,
      targetRepoFullName: obs.repoOwner && obs.repoName
        ? `${obs.repoOwner}/${obs.repoName}`
        : undefined,
    });

    const now = new Date().toISOString();
    await db
      .update(fleetObservations)
      .set({ hitlPromoted: 1, hitlRecordId, updatedAt: now })
      .where(eq(fleetObservations.id, observationId));

    return { success: true, hitlRecordId };
  }
}
