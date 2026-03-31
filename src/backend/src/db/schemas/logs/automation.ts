import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

/**
 * @file schemas/logs/automation.ts
 * Automation execution logs — owned by DB (core).
 *
 * These are operational audit records, NOT raw webhook event data.
 * Written by BaseAutomation.logExecution() via getDb(env.DB).
 */
export const automationLogs = sqliteTable('automation_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  repo: text('repo').notNull(),
  automationClass: text('automation_class').notNull(),
  status: text('status', { enum: ['success', 'failure', 'skipped'] }).notNull(),
  details: text('details'),
  prOrIssueNumber: integer('pr_or_issue_number'),
  deliveryId: text('delivery_id'),
  eventName: text('event_name'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});
