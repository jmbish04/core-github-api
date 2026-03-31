import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningEnrichment = sqliteTable('learning_enrichment', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull(),
  matchedUrl: text('matched_url').notNull(),
  relevanceScore: text('relevance_score'),
  snippet: text('snippet'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningEnrichmentRecord = typeof learningEnrichment.$inferSelect;
export type InsertLearningEnrichment = typeof learningEnrichment.$inferInsert;
