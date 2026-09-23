// env.DB
/**
 * @file src/backend/src/db/schemas/docs/agents.ts
 * @description D1 schema for the Colony agent registry.
 * Stores metadata about every agent exposed in the /docs/agents UI.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const docsAgents = sqliteTable('docs_agents', {
  id: text('id').primaryKey(), // e.g. "ux-design-agent"
  name: text('name').notNull(),
  description: text('description').notNull(),
  tags: text('tags').notNull().default('[]'), // JSON string[]
  iconName: text('icon_name').notNull().default('Sparkles'), // lucide-react icon name
  iconBg: text('icon_bg').notNull().default('bg-indigo-500/10 border border-indigo-500/20'),
  iconColor: text('icon_color').notNull().default('text-indigo-400'),
  workshopUrl: text('workshop_url'), // optional deep-link into a Workshop tab
  docsSlug: text('docs_slug'), // optional slug for /docs/agents/<slug>
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export type DocsAgent = typeof docsAgents.$inferSelect;
export type NewDocsAgent = typeof docsAgents.$inferInsert;
