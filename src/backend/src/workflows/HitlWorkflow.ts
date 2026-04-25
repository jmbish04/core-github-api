import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { getDb } from '@/db';
import { hitlQueue } from '@/db/schemas/workflows/hitl';
import { eq } from 'drizzle-orm';
import { getAgentByName } from 'agents';

interface HitlWorkflowParams {
  hitlRecordId: string;
  category: string;
}

export class HitlWorkflow extends WorkflowEntrypoint<Env, HitlWorkflowParams> {
  public async run(event: Readonly<WorkflowEvent<HitlWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const { hitlRecordId, category } = event.payload;
    const db = getDb(this.env.DB);

    // 1. We start by wait for an approval event.
    // This allows the workflow to sit durably for up to 7 days waiting for human intervention via front-end
    const approvalEvent = await step.waitForEvent(
      "Wait for HITL approval",
      {
        type: `approval-${hitlRecordId}`,
        timeout: "7 days",
      }
    );

    const payload = approvalEvent.payload as { approved: boolean, reason?: string, feedback?: string };

    // 2. Perform action based on approval flag
    await step.do('resolve-hitl', async () => {
      if (payload.approved) {
        // Find the LearningAgent and trigger its execution fallback if needed, or simply let the frontend trigger it when it approves
        // Actually, the implementation plan specifies that the frontend or the agent will trigger the approval event.
        // We will just fetch the hitlQueue and depending on category, we dispatch the agent
        const hitlRecord = await db.select().from(hitlQueue).where(eq(hitlQueue.id, hitlRecordId)).get();
        if (!hitlRecord || hitlRecord.status !== 'approved') {
          console.warn(`[HITL] Record ${hitlRecordId} was approved in workflow but status in DB is not 'approved'. Manual override or race condition.`);
          return;
        }

        console.log(`[HITL] Approval received for category: ${category}`);

        // Handle category specific dispatches
        // If category is "jules_session_dispatch", the LearningAgent handles this.
        if (category === 'jules_session_dispatch' || category === 'build_analysis') {
           const stub = await getAgentByName(this.env.LEARNING_AGENT as any, 'learning_agent') as any;
           if (stub && stub.dispatchApprovedAction) {
             await stub.dispatchApprovedAction(hitlRecord);
           } else {
             console.log("[HITL] Could not find dispatchApprovedAction inside the agent");
           }
        }
      } else {
        console.log(`[HITL] Action rejected for category: ${category}. Reason: ${payload.reason}`);
      }
    });

    // 3. We are done, life cycle of the workflow ends
  }
}
