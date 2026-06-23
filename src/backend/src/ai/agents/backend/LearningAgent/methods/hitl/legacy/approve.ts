import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesApprovals, julesBuildAnalysis } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent/index";
import type { ApprovalResult } from "@/ai/agents/backend/LearningAgent/types";
import { dispatchEngineerSprint } from "@/ai/agents/backend/LearningAgent/methods/hitl/dispatch";
import { sendDebrief } from "@/ai/agents/backend/LearningAgent/methods/hitl/debrief";

export async function approve(
  agent: LearningAgent,
  approvalId: string,
  userId: string,
  feedback?: string
): Promise<ApprovalResult> {
  const logger = new Logger((agent as any).env, "LearningAgent");
  const db = getDb((agent as any).env.DB);

  const rows = await db
    .select()
    .from(julesApprovals)
    .where(eq(julesApprovals.id, approvalId))
    .limit(1);

  if (!rows.length) {
    throw new Error(`Approval record not found: ${approvalId}`);
  }

  const approval = rows[0];
  const parsedPayload = JSON.parse(approval.proposedPayload) as {
    proposedPrompt: string;
    repoFullName: string;
    prNumber?: number;
  };

  // Merge human feedback into the final Jules prompt
  const finalPrompt = feedback
    ? `${parsedPayload.proposedPrompt}\n\n---\n**Human Feedback (Priority Override):**\n${feedback}`
    : parsedPayload.proposedPrompt;

  // Update the D1 ledger
  await db
    .update(julesApprovals)
    .set({
      status: "approved",
      humanFeedback: feedback ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(julesApprovals.id, approvalId));

  logger.info(`Approval ${approvalId} accepted by ${userId}. Dispatching Jules session.`);

  // Dispatch Jules session
  let julesSessionId: string | undefined;
  try {
    julesSessionId = await dispatchEngineerSprint(
      agent,
      parsedPayload.repoFullName,
      finalPrompt,
      approvalId
    );

    // Mark the source analysis as implemented
    if (approval.entityId) {
      await db
        .update(julesBuildAnalysis)
        .set({ status: "implemented", julesResponse: `Jules session: ${julesSessionId}` })
        .where(eq(julesBuildAnalysis.id, approval.entityId));
    }

    // Send an email debrief
    await sendDebrief(agent, approvalId, parsedPayload.repoFullName, julesSessionId, "approved");
  } catch (err: any) {
    logger.error(`Failed to dispatch Jules session for approval ${approvalId}`, { error: err.message });
  }

  return {
    success: true,
    approvalId,
    status: "approved",
    julesSessionId,
  };
}
