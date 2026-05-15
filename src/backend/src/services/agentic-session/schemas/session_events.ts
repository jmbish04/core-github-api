/**
 * @file services/agentic-session/schemas/session_events.ts
 * @description Drizzle schema for session events timeline.
 *   Stores discriminated-union event types for full session transparency.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { agenticSessions } from './sessions';

/**
 * Session Events table - Append-only log of all events in a session
 * Event types: system.start, system.complete, system.error, agent.thought,
 *              agent.action, agent.result, hitl.request, hitl.response,
 *              jules.status, jules.event, user.message
 */
export const sessionEvents = sqliteTable('agentic_session_events', {
  id: text('id').primaryKey(), // UUID
  sessionId: text('session_id').notNull().references(() => agenticSessions.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // Discriminated union type (e.g., "agent.thought")
  payload: text('payload').notNull(), // JSON string containing event-specific data
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  sequenceNum: integer('sequence_num').notNull(), // Sequential ordering within session
}, (table) => ({
  sessionIdx: index('agentic_session_events_session_idx').on(table.sessionId),
  typeIdx: index('agentic_session_events_type_idx').on(table.type),
  timestampIdx: index('agentic_session_events_timestamp_idx').on(table.timestamp),
  sequenceIdx: index('agentic_session_events_sequence_idx').on(table.sessionId, table.sequenceNum),
}));
