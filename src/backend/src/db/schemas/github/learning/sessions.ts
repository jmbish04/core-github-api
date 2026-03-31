import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningSessions = sqliteTable('learning_sessions', {
  id: text('id').primaryKey(),
  triggerType: text('trigger_type', { enum: ['cron', 'manual', 'webhook'] }).notNull(),
  status: text('status').default('pending'),
  insightCount: integer('insight_count').default(0),
  source: text('source'),
  repoless: integer('repoless', { mode: 'boolean' }).default(false),
  startedAt: integer('started_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningSession = typeof learningSessions.$inferSelect;
export type InsertLearningSession = typeof learningSessions.$inferInsert;
