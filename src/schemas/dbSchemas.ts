import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const test_defs = sqliteTable('test_defs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category'),
  severity: text('severity'),
  is_active: integer('is_active').notNull().default(1),
  error_map: text('error_map'),
  created_at: text('created_at').notNull(),
});

export const test_results = sqliteTable('test_results', {
  id: text('id').primaryKey(),
  session_uuid: text('session_uuid').notNull(),
  test_fk: text('test_fk').notNull().references(() => test_defs.id),
  started_at: text('started_at').notNull(),
  finished_at: text('finished_at'),
  duration_ms: integer('duration_ms'),
  status: text('status', { enum: ['pass', 'fail'] }).notNull(),
  error_code: text('error_code'),
  raw: text('raw'),
  ai_human_readable_error_description: text('ai_human_readable_error_description'),
  ai_prompt_to_fix_error: text('ai_prompt_to_fix_error'),
  created_at: text('created_at').notNull(),
});


export type TestDef = typeof test_defs.$inferSelect;
export type TestResult = typeof test_results.$inferSelect;

export interface DB {
    test_defs: TestDef;
    test_results: TestResult;
}
