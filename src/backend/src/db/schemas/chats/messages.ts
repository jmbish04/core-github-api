import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { threads } from './threads';
import { z } from 'zod';

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  // assistant-ui standard roles
  role: text('role', { enum: ['user', 'assistant', 'agent', 'system', 'tool'] }).notNull(),
  author: text('author').notNull(), //agent name or `user`
  // JSON stringified array of assistant-ui parts (text, tool-call, etc.)
  content: text('content', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export type Message = z.infer<typeof selectMessageSchema>;
export type NewMessage = z.infer<typeof insertMessageSchema>;