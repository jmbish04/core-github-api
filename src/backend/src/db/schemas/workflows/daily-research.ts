// env.DB
/**
 * @file src/db/schema-daily-research.ts
 * @description Drizzle ORM schema for Daily Research snapshots
 * @owner Agentic Research Team
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const dailyResearchDocs = sqliteTable('daily_research_docs', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // ISO Date YYYY-MM-DD
  prompt: text('prompt').notNull(),
  status: text('status').notNull(), // "pass" | "fail" | "needs_more_data"
  judgeNotes: text('judge_notes'),
  findings: text('findings', { mode: 'json' }).notNull(), // JSON array of RepoFinding
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch('now'))`)
    .notNull(),
});
