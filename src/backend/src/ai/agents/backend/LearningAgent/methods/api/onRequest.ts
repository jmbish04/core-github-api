/**
 * @file LearningAgent/methods/onRequest.ts
 * @description HTTP route handler for LearningAgent.
 *
 * Routes:
 *  GET  /health                → healthProbe()
 *  POST /queue                 → Queue a new build analysis for HITL review
 *  GET  /pending               → List all pending approvals
 *  POST /approve/:id           → Approve a queued item
 *  POST /reject/:id            → Reject a queued item
 *  POST /retry/:id             → Re-trigger a workflow for an expired item
 *  POST /diagnose              → Fleet-wide health diagnosis (any worker)
 *  POST /observe-correction    → Ingest a chat correction from peer agents
 *  GET  /fleet-observations    → List fleet observations (with query filters)
 *  POST /promote/:id           → Manually promote observation to HITL
 */
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent";
import type {
  QueueBuildAnalysisPayload,
  FleetDiagnoseInput,
  ChatCorrectionInput,
  FleetObservationFilter,
  ProposalTarget,
} from "../../types";
import { getDb } from "@db";
import { julesApprovals } from "@db/schemas/jules";
import { desc } from "drizzle-orm";

export async function onRequest(agent: LearningAgent, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const logger = agent.getLogger();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    if (url.pathname === "/health") {
      return json(await agent.healthProbe());
    }

    // ── Existing Build Analysis HITL Routes ──────────────────────────

    // Queue a new CI failure for HITL review
    if (url.pathname === "/queue" && request.method === "POST") {
      const body = (await request.json()) as QueueBuildAnalysisPayload;
      const approvalId = await agent.queueForApproval(body);
      return json({ approvalId, queued: true });
    }

    // List all pending HITL items
    if (url.pathname === "/pending" && request.method === "GET") {
      const db = getDb(agent.getEnv().DB);
      const all = await db
        .select()
        .from(julesApprovals)
        .orderBy(desc(julesApprovals.createdAt))
        .limit(100);
      return json({ items: all });
    }

    // Approve a specific item
    const approveMatch = url.pathname.match(/^\/approve\/(.+)$/);
    if (approveMatch && request.method === "POST") {
      const approvalId = approveMatch[1];
      const body = (await request.json()) as { feedback?: string; userId?: string };
      const result = await agent.approve(approvalId, body.userId ?? "user", body.feedback);
      return json(result);
    }

    // Reject a specific item
    const rejectMatch = url.pathname.match(/^\/reject\/(.+)$/);
    if (rejectMatch && request.method === "POST") {
      const approvalId = rejectMatch[1];
      const body = (await request.json()) as { reason?: string };
      const result = await agent.reject(approvalId, body.reason ?? "Rejected by user");
      return json(result);
    }

    // Retry an expired item
    const retryMatch = url.pathname.match(/^\/retry\/(.+)$/);
    if (retryMatch && request.method === "POST") {
      const approvalId = retryMatch[1];
      const newApprovalId = await agent.retryExpired(approvalId);
      return json({ newApprovalId, requeued: true });
    }

    // ── Fleet-Wide Routes (v7) ──────────────────────────────────────

    // Fleet-wide health diagnosis
    if (url.pathname === "/diagnose" && request.method === "POST") {
      const body = (await request.json()) as FleetDiagnoseInput;
      if (!body.target?.workerName) {
        return json({ error: "target.workerName is required" }, 400);
      }
      const result = await agent.diagnoseFleetFailure(body);
      return json(result);
    }

    // Ingest a chat correction
    if (url.pathname === "/observe-correction" && request.method === "POST") {
      const body = (await request.json()) as ChatCorrectionInput;
      if (!body.target?.workerName || !body.correctionMessage) {
        return json({ error: "target.workerName and correctionMessage are required" }, 400);
      }
      const result = await agent.observeChatCorrection(body);
      return json(result);
    }

    // List fleet observations (with query filters)
    if (url.pathname === "/fleet-observations" && request.method === "GET") {
      const filter: FleetObservationFilter = {
        workerName: url.searchParams.get("worker") ?? undefined,
        source: url.searchParams.get("source") ?? undefined,
        hitlPromoted: url.searchParams.has("promoted")
          ? url.searchParams.get("promoted") === "true"
          : undefined,
        limit: url.searchParams.has("limit")
          ? parseInt(url.searchParams.get("limit")!, 10)
          : undefined,
        offset: url.searchParams.has("offset")
          ? parseInt(url.searchParams.get("offset")!, 10)
          : undefined,
      };
      const result = await agent.listFleetObservations(filter);
      return json(result);
    }

    // Manually promote an observation to HITL
    const promoteMatch = url.pathname.match(/^\/promote\/(.+)$/);
    if (promoteMatch && request.method === "POST") {
      const observationId = promoteMatch[1];
      const body = (await request.json().catch(() => ({}))) as { target?: ProposalTarget };
      const result = await agent.promoteToHitl(observationId, body.target);
      return json(result);
    }

    return new Response("Not found", { status: 404 });
  } catch (err: any) {
    logger.error("LearningAgent error", { error: err.message });
    return json({ error: err.message }, 500);
  }
}
