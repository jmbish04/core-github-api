/**
 * @file src/db/schemas/workshop/ux_design_runs.ts
 * @description Tracks a full UX Design Agent pipeline run from prompt to Jules fleet.
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * One row per UX Design Agent run initiated by the user.
 * status progression: idle → enhancing → designing → stitch_loop → building → done | error
 */
export const workshopUxRuns = sqliteTable('workshop_ux_runs', {
  id: text('id').primaryKey(), // UUID
  projectId: text('project_id'), // FK to workshop_projects (optional)
  repoOwner: text('repo_owner').notNull(),
  repoName: text('repo_name').notNull(),
  status: text('status').notNull().default('idle'),
  phase: text('phase').notNull().default('idle'),
  originalPrompt: text('original_prompt').notNull(),
  enhancedPrompt: text('enhanced_prompt'),
  designMd: text('design_md'),
  stitchProjectId: text('stitch_project_id'),
  enhanceJulesSessionId: text('enhance_jules_session_id'),
  designJulesSessionId: text('design_jules_session_id'),
  error: text('error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export type UxRun = typeof workshopUxRuns.$inferSelect;
export type NewUxRun = typeof workshopUxRuns.$inferInsert;
