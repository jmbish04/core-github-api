import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesApprovals, julesBuildAnalysis } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent";
import type { QueueBuildAnalysisPayload } from "@/ai/agents/backend/LearningAgent/types";

export async function queueForApproval(
  agent: LearningAgent,
  payload: QueueBuildAnalysisPayload
): Promise<string> {
  const logger = new Logger((agent as any).env, "LearningAgent");
  const db = getDb((agent as any).env.DB);

  // Persist the source analysis record if not already done
  let analysisId = payload.analysisId;
  if (!analysisId) {
    analysisId = crypto.randomUUID();
    await db.insert(julesBuildAnalysis).values({
      id: analysisId,
      repoFullName: payload.repoFullName,
      prNumber: payload.prNumber,
      rawLogs: payload.rawLogs,
      status: "queued_for_approval",
    });
  } else {
    await db
      .update(julesBuildAnalysis)
      .set({ status: "queued_for_approval" })
      .where(eq(julesBuildAnalysis.id, analysisId));
  }

  // Create the approval record — permanent ledger entry
  const approvalId = crypto.randomUUID();
  await db.insert(julesApprovals).values({
    id: approvalId,
    workflowId: `workflow-${approvalId}`, // Placeholder; updated by Workflow on launch
    entityType: "build_analysis",
    entityId: analysisId,
    proposedPayload: JSON.stringify({
      proposedPrompt: payload.proposedPrompt,
      repoFullName: payload.repoFullName,
      prNumber: payload.prNumber,
    }),
    status: "pending",
  });

  logger.info(`Queued build analysis for HITL review`, { approvalId, analysisId });
  return approvalId;
}
