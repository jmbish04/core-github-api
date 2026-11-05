// env.DB
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const automationRunnerPolicies = sqliteTable(
  'automation_runner_policies',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    automationKey: text('automation_key').notNull(),
    triggerEvent: text('trigger_event').notNull(),
    runnerKind: text('runner_kind').notNull(),
    targetRef: text('target_ref'),
    repoOwner: text('repo_owner'),
    repoName: text('repo_name'),
    branchPattern: text('branch_pattern'),
    infrastructure: text('infrastructure'),
    priority: integer('priority').notNull().default(100),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    automationIdx: index('idx_automation_runner_policies_automation').on(table.automationKey),
    activeIdx: index('idx_automation_runner_policies_active').on(table.isActive),
    eventIdx: index('idx_automation_runner_policies_event').on(table.triggerEvent),
  }),
);

export type AutomationRunnerPolicyRow = typeof automationRunnerPolicies.$inferSelect;
export type NewAutomationRunnerPolicyRow = typeof automationRunnerPolicies.$inferInsert;
export type AutomationRunnerKind = 'internal_agent' | 'jules' | 'github_assignment';
