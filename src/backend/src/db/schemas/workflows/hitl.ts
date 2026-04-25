import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const hitlQueue = sqliteTable('hitl_queue', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  category: text('category').notNull(),
  entityId: text('entity_id'),
  proposedPayload: text('proposed_payload', { mode: 'json' }).notNull(),
  contextMetadata: text('context_metadata', { mode: 'json' }).notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'expired'] }).notNull().default('pending'),
  humanFeedback: text('human_feedback'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),

  // ── Fleet-Wide Proposal Routing (v7) ────────────────────────────────
  /** Where approved proposals should be routed */
  proposalTarget: text('proposal_target', {
    enum: ['template-repo', 'guardrail-rules', 'core-github-api', 'worker-specific'],
  }),
  /** The specific worker this proposal addresses */
  targetWorkerName: text('target_worker_name'),
  /** Full repo name (owner/repo) for worker-specific proposals */
  targetRepoFullName: text('target_repo_full_name'),
  /**
   * false = reviewer can re-target before approving.
   * true  = target is locked (set on approval).
   */
  proposalTargetLocked: integer('proposal_target_locked').default(0),
});
