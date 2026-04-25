/**
 * @file ai/agents/workflows/ContinuousLearning.ts
 * @description Cloudflare Workflow that drives the CI Healer HITL pipeline.
 *
 * Flow:
 *  1. Receives a CI failure payload (repo, PR, logs, proposed Jules prompt).
 *  2. Persists a draft approval record to D1 via LearningAgent.
 *  3. Sleeps up to 7 days for a human to approve/reject via the /learning/queue UI.
 *  4. On approval, the LearningAgent handles Jules orchestration.
 *    (The workflow's role ends after the waitForApproval gate — the agent RPC drives execution.)
 *
 * Note: All records in D1 persist indefinitely regardless of workflow timeout.
 * The frontend shows ALL records; expired ones can be retried via /retry/:id.
 *
 * @module AI/Agents/Workflows/ContinuousLearning
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesApprovals } from "@db/schemas/jules";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContinuousLearningParams = {
  repoFullName: string;
  prNumber?: number;
  rawLogs: string;
  proposedPrompt: string;
  /** Pre-assigned approval ID from the agent's queueForApproval call */
  approvalId: string;
};

// ---------------------------------------------------------------------------
// ContinuousLearningWorkflow
// ---------------------------------------------------------------------------

export class ContinuousLearningWorkflow extends WorkflowEntrypoint<Env, ContinuousLearningParams> {
  async run(event: WorkflowEvent<ContinuousLearningParams>, step: WorkflowStep) {
    const logger = new Logger(this.env, "ContinuousLearningWorkflow");
    const params = event.payload;

    logger.info(`HITL workflow started for approval ${params.approvalId}`, {
      repo: params.repoFullName,
      pr: params.prNumber,
    });

    // Step 1: Stamp the workflow ID on the D1 record so we can correlate later
    await step.do("stamp-workflow-id", async () => {
      const db = getDb(this.env.DB);
      const instanceId = event.instanceId ?? `workflow-${params.approvalId}`;
      await db
        .update(julesApprovals)
        .set({ workflowId: instanceId })
        .where(eq(julesApprovals.id, params.approvalId));
    });

    // Step 2: Wait for human review — 7 day timeout
    // After timeout the D1 record remains as 'pending'; the frontend can retry via /retry/:id
    await step.sleep("wait-for-human-review", "7 days");

    // Step 3: Check if a human actioned the approval during the wait window
    const finalStatus = await step.do("check-final-status", async () => {
      const db = getDb(this.env.DB);
      const rows = await db
        .select()
        .from(julesApprovals)
        .where(eq(julesApprovals.id, params.approvalId))
        .limit(1);

      return rows[0]?.status ?? "expired";
    });

    if (finalStatus === "pending") {
      // Mark as expired in D1 — remains visible in the frontend queue for manual retry
      await step.do("mark-expired", async () => {
        const db = getDb(this.env.DB);
        await db
          .update(julesApprovals)
          .set({ status: "expired", updatedAt: new Date().toISOString() })
          .where(eq(julesApprovals.id, params.approvalId));
      });

      logger.info(`Approval ${params.approvalId} expired after 7-day window. Record preserved in D1 for manual retry.`);
    } else {
      logger.info(`Approval ${params.approvalId} was already actioned: ${finalStatus}`);
    }
  }
}
