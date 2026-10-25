import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const prJobs = sqliteTable('pr_jobs', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  prNumber: integer('pr_number').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});
