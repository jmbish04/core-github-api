import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { threads } from './threads';
import { z } from 'zod';

/**
 * Tracks which agents (and users) participate in a given thread.
 * Each row represents a single participant in a thread.
 */
export const threadParticipants = sqliteTable(
  'thread_participants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    threadId: integer('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    /** Agent class name (e.g. 'GuardrailAgent') or 'user' */
    agentName: text('agent_name').notNull(),
    role: text('role', { enum: ['host', 'participant', 'user'] })
      .notNull()
      .default('participant'),
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    /** Set when the participant leaves the thread; null = still active */
    leftAt: integer('left_at', { mode: 'timestamp' }),
  },
  (t) => ([
    // Fast lookup: all participants in a thread
    index('tp_thread_id_idx').on(t.threadId),
    // Unique constraint: one agent per thread (prevents double-join)
    uniqueIndex('tp_thread_agent_idx').on(t.threadId, t.agentName),
  ])
);

export const insertThreadParticipantSchema = createInsertSchema(threadParticipants);
export const selectThreadParticipantSchema = createSelectSchema(threadParticipants);

export type ThreadParticipant = z.infer<typeof selectThreadParticipantSchema>;
export type NewThreadParticipant = z.infer<typeof insertThreadParticipantSchema>;
