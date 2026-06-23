import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const collaboration_sessions = sqliteTable('collaboration_sessions', {
  id: text('id').primaryKey(),
  initiatedBy: text('initiated_by').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const collaboration_participants = sqliteTable('collaboration_participants', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => collaboration_sessions.id),
  agentName: text('agent_name').notNull(),
  joinedAt: text('joined_at').notNull(),
  leftAt: text('left_at')
});

export const collaboration_events = sqliteTable('collaboration_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => collaboration_sessions.id),
  sourceAgent: text('source_agent').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  timestamp: text('timestamp').notNull()
});
