import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(), // We can generate uuids or use short IDs
  name: text('name').notNull().unique(),
  description: text('description'),
  hexColor: text('hex_color').default('#3b82f6'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
