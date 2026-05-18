import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningTags = sqliteTable('learning_tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  color: text('color'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export type LearningTag = typeof learningTags.$inferSelect;
export type InsertLearningTag = typeof learningTags.$inferInsert;

// env.DB_WEBHOOKS env.DB
