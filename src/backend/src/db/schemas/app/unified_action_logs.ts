// env.DB
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const unifiedActionLogsTable = sqliteTable('unified_action_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().unique(),
  taskType: text('task_type').notNull(),
  githubOwner: text('github_owner').notNull(),
  githubRepo: text('github_repo').notNull(),
  projectId: text('project_id'),
  requestPayload: text('request_payload').notNull(),
  responsePayload: text('response_payload'),
  status: text('status', { enum: ['pending', 'in_progress', 'success', 'error'] }).notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});
