// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningAiInsightPrs = sqliteTable('learning_ai_insight_prs', {
  id: text('id').primaryKey(),
  insightId: text('insight_id').notNull(),
  prNumber: integer('pr_number').notNull(),
  repo: text('repo').notNull(),
  status: text('status').notNull().default('open'),
  outcome: text('outcome'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningAiInsightPr = typeof learningAiInsightPrs.$inferSelect;
export type InsertLearningAiInsightPr = typeof learningAiInsightPrs.$inferInsert;
