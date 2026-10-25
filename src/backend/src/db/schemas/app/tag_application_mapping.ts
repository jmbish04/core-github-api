// env.DB
import { text, integer, sqliteTable, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { applications } from './applications';
import { tags } from './tags';

export const tagApplicationMapping = sqliteTable('tag_application_mapping', {
  appId: text('app_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.appId, t.tagId] }),
}));
