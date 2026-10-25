// env.DB
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

/**
 * @file schemas/webhooks/automations.ts
 * Tables owned by DB_WEBHOOKS.
 *
 * GOVERNANCE: Only webhook_configs lives here.
 * automation_logs has been moved to schemas/logs/automation.ts (owned by DB core).
 */
export const webhookConfigs = sqliteTable('webhook_configs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationClass: text('automation_class').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  usePat: integer('use_pat', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});
