// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningMessages = sqliteTable('learning_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  sessionId: text('session_id').notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  vectorizeId: text('vectorize_id'),
  processed: integer('processed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningMessage = typeof learningMessages.$inferSelect;
export type InsertLearningMessage = typeof learningMessages.$inferInsert;
