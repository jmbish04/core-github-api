/**
 * @file services/agentic-session/schemas/session_grants.ts
 * @description Drizzle schema for session access grants.
 *   Controls who can subscribe/publish to a session via JWT verification.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { agenticSessions } from './sessions';

/**
 * Session Grants table - Authorization records for session access
 */
export const sessionGrants = sqliteTable('agentic_session_grants', {
  id: text('id').primaryKey(), // UUID
  sessionId: text('session_id').notNull().references(() => agenticSessions.id, { onDelete: 'cascade' }),
  granteeId: text('grantee_id').notNull(), // User ID, agent ID, or wildcard ("*")
  granteeType: text('grantee_type', { enum: ['agent', 'user', 'system', 'wildcard'] }).notNull(),
  permissions: text('permissions').notNull(), // JSON array: ["read", "write", "admin"]
  grantedBy: text('granted_by'), // Who issued the grant
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer('expires_at', { mode: 'timestamp' }), // Optional expiration
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  sessionIdx: index('agentic_session_grants_session_idx').on(table.sessionId),
  granteeIdx: index('agentic_session_grants_grantee_idx').on(table.granteeId),
  expiresAtIdx: index('agentic_session_grants_expires_at_idx').on(table.expiresAt),
}));
