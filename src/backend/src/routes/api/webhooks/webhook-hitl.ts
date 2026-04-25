/**
 * @file routes/api/webhooks/webhook-hitl.ts
 * @description Reusable helper for creating HITL proposals from webhook handlers.
 *
 * Any webhook handler can call `createHitlProposal()` to insert a pending
 * item into the hitl_queue and optionally kick off the HitlWorkflow for
 * durable approval waiting.
 *
 * Authentication: Callers must validate webhook authenticity before calling
 * this helper (e.g., GitHub signature verification).
 */

import { getDb } from '@db';
import { hitlQueue } from '@db/schemas/workflows/hitl';
import { eq } from 'drizzle-orm';
import { Logger } from '@/lib/logger';

export interface HitlProposalInput {
  /** Category key (e.g., 'ci_failure', 'build_analysis', 'pr_review') */
  category: string;
  /** Optional entity ID (PR number, session ID, etc.) */
  entityId?: string;
  /** The proposed action payload — what the agent wants to do */
  proposedPayload: Record<string, unknown>;
  /** Contextual metadata for human review (webhook event, repo, etc.) */
  contextMetadata?: Record<string, unknown>;
}

export interface HitlProposalResult {
  /** UUID of the created HITL record */
  id: string;
  /** Workflow instance ID if HitlWorkflow was kicked off */
  workflowId: string | null;
}

/**
 * Create a HITL proposal from a webhook handler.
 *
 * Inserts a pending record into `hitl_queue` and optionally kicks off
 * the `HitlWorkflow` (if the binding exists) for durable approval waiting.
 *
 * @param env   - Worker environment bindings
 * @param input - Proposal configuration
 * @returns The created HITL record ID and optional workflow ID
 *
 * @example
 * ```ts
 * // Inside a webhook handler:
 * const result = await createHitlProposal(c.env, {
 *   category: 'ci_failure',
 *   entityId: `${repoFullName}#${prNumber}`,
 *   proposedPayload: { action: 'fix_build', branch, sessionId },
 *   contextMetadata: { event: 'check_run', checkName: payload.check_run.name },
 * });
 * ```
 */
export async function createHitlProposal(
  env: Env,
  input: HitlProposalInput,
): Promise<HitlProposalResult> {
  const logger = new Logger(env, 'WebhookHitl');
  const db = getDb(env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(hitlQueue).values({
    id,
    workflowId: '',
    category: input.category,
    entityId: input.entityId ?? null,
    proposedPayload: input.proposedPayload,
    contextMetadata: input.contextMetadata ?? {},
    status: 'pending',
    humanFeedback: null,
    createdAt: now,
    updatedAt: now,
  });

  logger.info(`Created HITL proposal: ${id} (category: ${input.category})`);

  // Kick off HitlWorkflow for durable approval waiting
  let workflowId: string | null = null;
  try {
    if ((env as any).HITL_WORKFLOW) {
      const instance = await (env as any).HITL_WORKFLOW.create({
        params: { hitlRecordId: id, category: input.category },
      });
      workflowId = instance.id;
      // Update the record with the workflow instance ID
      await db
        .update(hitlQueue)
        .set({ workflowId: workflowId ?? '', updatedAt: new Date().toISOString() })
        .where(eq(hitlQueue.id, id));
      logger.info(`Started HitlWorkflow ${workflowId} for proposal ${id}`);
    } else {
      logger.warn('HITL_WORKFLOW binding not available — proposal created without workflow');
    }
  } catch (err: any) {
    logger.error(`Failed to start HitlWorkflow for proposal ${id}: ${err.message}`);
    // Item still exists for manual review — non-fatal
  }

  return { id, workflowId };
}
