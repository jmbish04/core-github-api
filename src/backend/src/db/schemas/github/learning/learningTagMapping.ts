// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningTagMapping = sqliteTable('learning_tag_mapping', {
  id: text('id').primaryKey(),
  insightId: text('insight_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningTagMappingRecord = typeof learningTagMapping.$inferSelect;
export type InsertLearningTagMapping = typeof learningTagMapping.$inferInsert;
