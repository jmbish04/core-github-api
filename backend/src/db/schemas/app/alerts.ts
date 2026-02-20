/**
 * @file backend/src/db/schemas/app/alerts.ts
 * @description Drizzle schema for Security and System Alerts
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(), // UUID
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  title: text('title').notNull(),
  description: text('description').notNull(),
  processOrigin: text('process_origin').notNull(), // e.g. "LeakPlumber"
  repoOrigin: text('repo_origin').notNull(), // e.g. "owner/repo"
  workerOrigin: text('worker_origin').notNull(), // e.g. "worker-name"
  isActionNeeded: integer('is_action_needed', { mode: 'boolean' }).notNull().default(false),
  actionRequired: text('action_required'), // "Rotate secret manually in dashboard"
  isResolved: integer('is_resolved', { mode: 'boolean' }).notNull().default(false),
  timestampResolved: integer('timestamp_resolved', { mode: 'timestamp' }),
  resolvedBy: text('resolved_by'), // User who resolved it
}, (table) => ({
  timestampIdx: index('alerts_timestamp_idx').on(table.timestamp),
  resolvedIdx: index('alerts_resolved_idx').on(table.isResolved),
}));

export type SelectAlert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;
