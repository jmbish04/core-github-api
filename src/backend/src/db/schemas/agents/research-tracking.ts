/**
 * @file db/schemas/agents/research-tracking.ts
 * @description Drizzle ORM schemas for the ResearchAgent's generic source
 *              tracking system. Replaces the single-purpose `cloudflare_changelog`
 *              and `newsletter_repos` tables with a generalized architecture.
 *
 * Tables:
 *   - `tracked_sources` — configurable monitors (RSS feeds, search queries, etc.)
 *   - `tracked_items`   — individual discoveries from any source
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// tracked_sources — what ResearchAgent monitors
// ---------------------------------------------------------------------------

export const trackedSources = sqliteTable('tracked_sources', {
  id: text('id').primaryKey(),

  /** Source type determines which polling strategy to use */
  type: text('type', {
    enum: ['rss', 'discord', 'github_search', 'web_search'],
  }).notNull(),

  /** RSS feed URL, Discord search query, GitHub search query, etc. */
  queryOrUrl: text('query_or_url').notNull(),

  /** Human-readable label (e.g. "Cloudflare Core Platform Changelog") */
  name: text('name').notNull(),

  /** How often this source should be polled */
  frequency: text('frequency', {
    enum: ['hourly', 'daily', 'weekly'],
  }).notNull().default('daily'),

  /** Toggle to pause polling without deleting the source */
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  /** ISO timestamp of the most recent successful poll */
  lastCheckedAt: text('last_checked_at'),

  /** Optional: Discord guild_id / channel_id for scoped searches */
  metadata: text('metadata', { mode: 'json' }).$type<{
    guildId?: string;
    channelId?: string;
    maxResults?: number;
    keywords?: string[];
  }>(),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  typeIdx: index('tracked_sources_type_idx').on(table.type),
  activeIdx: index('tracked_sources_active_idx').on(table.isActive, table.lastCheckedAt),
}));

// ---------------------------------------------------------------------------
// tracked_items — individual discoveries from any source
// ---------------------------------------------------------------------------

export const trackedItems = sqliteTable('tracked_items', {
  id: text('id').primaryKey(),

  /** FK to the source that produced this item */
  sourceId: text('source_id')
    .notNull()
    .references(() => trackedSources.id, { onDelete: 'cascade' }),

  /** Entry title */
  title: text('title').notNull(),

  /** Canonical URL — unique to prevent duplicates across polls */
  url: text('url').notNull(),

  /** Raw description / content / snippet */
  content: text('content'),

  /** AI-generated one-sentence technical summary */
  aiSummary: text('ai_summary'),

  /** Original publication timestamp (from RSS pubDate, message timestamp, etc.) */
  publishedAt: text('published_at'),

  /** Has this item been included in a newsletter dispatch? */
  emailed: integer('emailed', { mode: 'boolean' }).notNull().default(false),

  /** Has this item been proposed to the HITL queue? */
  hitlQueued: integer('hitl_queued', { mode: 'boolean' }).notNull().default(false),

  /** FK to hitl_queue.id if proposed */
  hitlRecordId: text('hitl_record_id'),

  /** Has the LearningAgent reviewed this item for standardization? */
  processedByLearningAgent: integer('processed_by_learning_agent', { mode: 'boolean' })
    .notNull()
    .default(false),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  sourceIdx: index('tracked_items_source_idx').on(table.sourceId),
  emailedIdx: index('tracked_items_emailed_idx').on(table.emailed),
  hitlIdx: index('tracked_items_hitl_idx').on(table.hitlQueued),
  urlIdx: uniqueIndex('tracked_items_url_idx').on(table.url),
}));

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type TrackedSourceRow = typeof trackedSources.$inferSelect;
export type NewTrackedSourceRow = typeof trackedSources.$inferInsert;
export type TrackedItemRow = typeof trackedItems.$inferSelect;
export type NewTrackedItemRow = typeof trackedItems.$inferInsert;
