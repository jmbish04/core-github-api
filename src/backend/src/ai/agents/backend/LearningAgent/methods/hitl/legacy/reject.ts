import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesApprovals } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import type { LearningAgent } from "../../../index";
import type { ApprovalResult } from "../../../types";
import { sendDebrief } from "../debrief";

export async function reject(
  agent: LearningAgent,
  approvalId: string,
  reason: string
): Promise<ApprovalResult> {
  const logger = new Logger((agent as any).env, "LearningAgent");
  const db = getDb((agent as any).env.DB);

  await db
    .update(julesApprovals)
    .set({
      status: "rejected",
      humanFeedback: reason,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(julesApprovals.id, approvalId));

  logger.info(`Approval ${approvalId} rejected. Reason: ${reason}`);

  // Send a debrief noting the rejection
  await sendDebrief(agent, approvalId, "unknown", undefined, "rejected");

  return { success: true, approvalId, status: "rejected" };
}
