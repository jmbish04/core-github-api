// env.DB
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['worker', 'pages'] }).notNull(),
  url: text('url'),
  githubRepo: text('github_repo'),
  description: text('description'),
  summary: text('summary'),
  lastDeployedDate: integer('last_deployed_date', { mode: 'timestamp' }),
  lastTrafficDate: integer('last_traffic_date', { mode: 'timestamp' }),
  lastBuildDate: integer('last_build_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
