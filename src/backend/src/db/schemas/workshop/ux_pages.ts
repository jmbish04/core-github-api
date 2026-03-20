/**
 * @file src/db/schemas/workshop/ux_pages.ts
 * @description Tracks the per-page state within a UX Design Agent run.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * One row per page discovered in the design-md output.
 * status: pending → designing → review → committed → building → done | error
 */
export const workshopUxPages = sqliteTable('workshop_ux_pages', {
  id: text('id').primaryKey(), // UUID
  runId: text('run_id').notNull(), // FK to workshop_ux_runs
  pageName: text('page_name').notNull(), // e.g. "overview", "settings"
  pageTitle: text('page_title').notNull(), // Human-readable
  pagePrompt: text('page_prompt'), // Stitch prompt for this specific page
  status: text('status').notNull().default('pending'),
  reviewIterations: integer('review_iterations').notNull().default(0),
  reviewScore: integer('review_score'), // 0-10
  stitchScreenId: text('stitch_screen_id'),
  stitchHtml: text('stitch_html'), // Full HTML content from Stitch
  stitchScreenshotUrl: text('stitch_screenshot_url'),
  githubHtmlPath: text('github_html_path'), // Path committed on GitHub
  githubScreenshotPath: text('github_screenshot_path'),
  githubCommitSha: text('github_commit_sha'),
  julesSessionId: text('jules_session_id'), // Phase 4 fleet session
  julesPrUrl: text('jules_pr_url'),
  error: text('error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export type UxPage = typeof workshopUxPages.$inferSelect;
export type NewUxPage = typeof workshopUxPages.$inferInsert;
