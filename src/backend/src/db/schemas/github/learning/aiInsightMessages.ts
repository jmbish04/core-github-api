// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningAiInsightMessages = sqliteTable('learning_ai_insight_messages', {
  id: text('id').primaryKey(),
  insightId: text('insight_id').notNull(),
  messageId: text('message_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningAiInsightMessage = typeof learningAiInsightMessages.$inferSelect;
export type InsertLearningAiInsightMessage = typeof learningAiInsightMessages.$inferInsert;
