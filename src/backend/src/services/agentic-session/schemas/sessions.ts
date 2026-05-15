/**
 * @file services/agentic-session/schemas/sessions.ts
 * @description Drizzle schema for agentic session records.
 *   Tracks WebSocket-based sessions for agent transparency.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Sessions table - Tracks active/completed agentic sessions
 */
// Table name is `agentic_sessions` (not `sessions`) to avoid collision with the
// existing legacy `sessions` table in migration 0000. Drizzle export is kept as
// `sessions` so application code (d1.ts, AgenticSessionDO, etc.) reads cleanly
// within the agentic-session module's namespace.
export const agenticSessions = sqliteTable('agentic_sessions', {
  id: text('id').primaryKey(), // UUID
  name: text('name'), // Optional human-readable name
  status: text('status', { enum: ['active', 'completed', 'error'] }).notNull().default('active'),
  createdBy: text('created_by'), // User ID or agent ID that initiated
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  metadata: text('metadata'), // JSON string for additional context
}, (table) => ({
  statusIdx: index('agentic_sessions_status_idx').on(table.status),
  createdByIdx: index('agentic_sessions_created_by_idx').on(table.createdBy),
  createdAtIdx: index('agentic_sessions_created_at_idx').on(table.createdAt),
}));
