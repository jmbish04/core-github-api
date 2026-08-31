// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningAiInsights = sqliteTable('learning_ai_insights', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  patternType: text('pattern_type', {
    enum: ['doom_loop', 'anti_pattern', 'standard_violation', 'best_practice'],
  }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: integer('severity').notNull().default(1),
  vectorId: text('vector_id'),
  status: text('status').notNull().default('open'),
  repo: text('repo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningAiInsight = typeof learningAiInsights.$inferSelect;
export type InsertLearningAiInsight = typeof learningAiInsights.$inferInsert;
