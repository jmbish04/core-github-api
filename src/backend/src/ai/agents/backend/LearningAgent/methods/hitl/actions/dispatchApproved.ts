import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import type { LearningAgent } from "../../../index";
import { dispatchEngineerSprint } from "../dispatch";
import { julesBuildAnalysis } from "@db/schemas/jules";
import { eq } from "drizzle-orm";

export async function dispatchApprovedAction(
  agent: LearningAgent,
  hitlRecord: any
): Promise<void> {
  const logger = new Logger((agent as any).env, "LearningAgent");
  
  logger.info(`Dispatching logic for approved action: ${hitlRecord.id}`);

  if (hitlRecord.category === 'build_analysis' || hitlRecord.category === 'jules_session_dispatch') {
      const payload = hitlRecord.proposedPayload as {
          proposedPrompt?: string;
          prompt?: string;
          repoFullName: string;
          prNumber?: number;
      };

      const finalPrompt = hitlRecord.humanFeedback 
        ? `${payload.proposedPrompt || payload.prompt}\n\n---\n**Human Feedback (Priority Override):**\n${hitlRecord.humanFeedback}`
        : (payload.proposedPrompt || payload.prompt || "");

      let sprintId: string | undefined;
      try {
        sprintId = await dispatchEngineerSprint(
          agent,
          payload.repoFullName,
          finalPrompt,
          hitlRecord.id
        );

        if (hitlRecord.entityId) {
          const db = getDb((agent as any).env.DB);
          await db
            .update(julesBuildAnalysis)
            .set({ status: "implemented", julesResponse: `Sprint session: ${sprintId}` })
            .where(eq(julesBuildAnalysis.id, hitlRecord.entityId));
        }

        logger.info(`Successfully dispatched Engineer sprint for action ${hitlRecord.id}`);
      } catch (err: any) {
        logger.error(`Failed to dispatch Engineer sprint for action ${hitlRecord.id}`, { error: err.message });
      }
  } else {
      logger.warn(`No handler implemented for category: ${hitlRecord.category}`);
  }
}

