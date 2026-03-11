import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const podcasts = sqliteTable('podcasts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
  transcript: text('transcript', { mode: 'json' }), // JSON string
  r2_audio_key: text('r2_audio_key'),
  audio_url: text('audio_url'),
  status: text('status').notNull().default('pending'),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  metadata: text('metadata', { mode: 'json' }) // Optional extra metadata
});

export type Podcast = typeof podcasts.$inferSelect;
export type NewPodcast = typeof podcasts.$inferInsert;
