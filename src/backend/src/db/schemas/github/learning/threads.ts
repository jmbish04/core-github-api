// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningThreads = sqliteTable('learning_threads', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  topic: text('topic'),
  agentRunId: text('agent_run_id'),
  messageCount: integer('message_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningThread = typeof learningThreads.$inferSelect;
export type InsertLearningThread = typeof learningThreads.$inferInsert;
