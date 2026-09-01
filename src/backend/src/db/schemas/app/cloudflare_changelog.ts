// env.DB
/**
 * @file db/schemas/app/cloudflare_changelog.ts
 * @description Drizzle ORM schema for Cloudflare Changelog RSS ingestion.
 * Tracks every fetched entry and whether it has been included in a daily email.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const cloudflareChangelog = sqliteTable('cloudflare_changelog', {
  /** Unique entry identifier — mapped from RSS <guid> or <link> */
  id: text('id').primaryKey(),

  /** The <title> of the changelog entry */
  title: text('title').notNull(),

  /** The canonical URL of the changelog entry */
  link: text('link').notNull(),

  /** Raw <description> / content from the RSS feed */
  description: text('description').notNull(),

  /** AI-generated one-sentence technical summary */
  aiSummary: text('ai_summary'),

  /** The <pubDate> string from the RSS feed (kept as-is for display) */
  pubDate: text('pub_date').notNull(),

  /** Unix timestamp of when this row was written to D1 */
  fetchedAt: integer('fetched_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),

  /**
   * Email dispatch flag.
   * 0 = not yet emailed, 1 = included in a sent daily email.
   * Drizzle stores booleans as integers in SQLite.
   */
  emailed: integer('emailed', { mode: 'boolean' }).notNull().default(false),
});

export type CloudflareChangelogEntry = typeof cloudflareChangelog.$inferSelect;
export type NewCloudflareChangelogEntry = typeof cloudflareChangelog.$inferInsert;
