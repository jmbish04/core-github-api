/**
 * @file services/agentic-session/schemas/session_subscribers.ts
 * @description Drizzle schema for tracking WebSocket subscribers to sessions.
 *   Records who is actively subscribed for real-time updates.
 */

import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { agenticSessions } from './sessions';

/**
 * Session Subscribers table - Tracks active WebSocket connections to sessions
 */
export const sessionSubscribers = sqliteTable('agentic_session_subscribers', {
  sessionId: text('session_id').notNull().references(() => agenticSessions.id, { onDelete: 'cascade' }),
  subscriberId: text('subscriber_id').notNull(), // Agent ID, user ID, or client identifier
  subscriberType: text('subscriber_type', { enum: ['agent', 'user', 'system'] }).notNull(),
  connectedAt: integer('connected_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  disconnectedAt: integer('disconnected_at', { mode: 'timestamp' }),
  lastHeartbeat: integer('last_heartbeat', { mode: 'timestamp' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.sessionId, table.subscriberId] }),
  sessionIdx: index('agentic_session_subscribers_session_idx').on(table.sessionId),
  subscriberIdx: index('agentic_session_subscribers_subscriber_idx').on(table.subscriberId),
  connectedAtIdx: index('agentic_session_subscribers_connected_at_idx').on(table.connectedAt),
}));
