import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const webhookConfigs = sqliteTable('webhook_configs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationClass: text('automation_class').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  usePat: integer('use_pat', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

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
