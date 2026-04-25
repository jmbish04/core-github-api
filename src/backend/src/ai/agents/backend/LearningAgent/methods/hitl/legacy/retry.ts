import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesApprovals } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent";

export async function retryExpired(agent: LearningAgent, originalApprovalId: string): Promise<string> {
  const db = getDb((agent as any).env.DB);
  const logger = new Logger((agent as any).env, "LearningAgent");

  const rows = await db
    .select()
    .from(julesApprovals)
    .where(eq(julesApprovals.id, originalApprovalId))
    .limit(1);

  if (!rows.length) {
    throw new Error(`Original approval not found: ${originalApprovalId}`);
  }

  const original = rows[0];

  // Create a fresh approval record for the retry
  const newApprovalId = crypto.randomUUID();
  await db.insert(julesApprovals).values({
    id: newApprovalId,
    workflowId: `workflow-retry-${newApprovalId}`,
    entityType: original.entityType,
    entityId: original.entityId,
    proposedPayload: original.proposedPayload,
    status: "pending",
    humanFeedback: `Retried from expired approval ${originalApprovalId}`,
  });

  logger.info(`Retried expired approval ${originalApprovalId} → new approval ${newApprovalId}`);
  return newApprovalId;
}
