// env.DB
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const RESEARCH_JUDGMENTS_STATUSES = ['pass', 'needs_more_data', 'fail'] as const;

export const research_judgments = sqliteTable('research_judgments', {
  id: text('id').primaryKey(), // UUID
  prompt: text('prompt').notNull(),
  status: text('status', { enum: RESEARCH_JUDGMENTS_STATUSES }).notNull(),
  judgeNotes: text('judge_notes'),
  findings: text('findings'), // JSON stringified array of the accepted findings
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export type SelectResearchJudgment = typeof research_judgments.$inferSelect;
export type InsertResearchJudgment = typeof research_judgments.$inferInsert;

export const InsertResearchJudgmentSchema = createInsertSchema(research_judgments);
export const SelectResearchJudgmentSchema = createSelectSchema(research_judgments);
