import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { hitlQueue } from "@db/schemas/workflows/hitl";
import { eq } from "drizzle-orm";
import type { LearningAgent } from "../../../index";

export async function rejectAction(
  agent: LearningAgent,
  hitlRecordId: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  const logger = new Logger((agent as any).env, "LearningAgent");
  const db = getDb((agent as any).env.DB);

  const rows = await db
    .select()
    .from(hitlQueue)
    .where(eq(hitlQueue.id, hitlRecordId))
    .limit(1);

  if (!rows.length) {
    throw new Error(`HITL record not found: ${hitlRecordId}`);
  }

  await db
    .update(hitlQueue)
    .set({
      status: "rejected",
      humanFeedback: reason ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(hitlQueue.id, hitlRecordId));

  logger.info(`HITL Action ${hitlRecordId} rejected. Reason: ${reason}`);

  return { success: true, status: "rejected" };
}
