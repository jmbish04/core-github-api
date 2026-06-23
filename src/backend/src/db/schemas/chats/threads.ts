import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { repositories } from "@db/schemas/github/repos";
import { z } from 'zod';

export const threads = sqliteTable(
  'threads',
  {
    // Auto-increment int PK — compact FK reference in messages table
    id: integer('id').primaryKey({ autoIncrement: true }),
    // UUID for external API lookups — routes accept either id or uuid
    uuid: text('uuid')
      .notNull()
      .$defaultFn(() => crypto.randomUUID())
      .unique(),
    // NULL = title pending AI generation after first message is inserted
    title: text('title'),
    repoId: text("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    // Timestamp set once title has been AI-generated; null = still pending
    titleGeneratedAt: integer('title_generated_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => ([
    // Efficient API lookup by uuid
    uniqueIndex('threads_uuid_idx').on(t.uuid),
    // Scan for threads that still need titles generated
    index('threads_title_pending_idx').on(t.titleGeneratedAt),
  ])
);

export const insertThreadSchema = createInsertSchema(threads);
export const selectThreadSchema = createSelectSchema(threads);

export type Thread = z.infer<typeof selectThreadSchema>;
export type NewThread = z.infer<typeof insertThreadSchema>;