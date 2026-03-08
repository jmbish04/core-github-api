import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * System Logs - Persistent logging for workers, agents, and workflows
 */
export const systemLogs = sqliteTable('system_logs', {
  id: text('id').primaryKey(),
  level: text('level', { enum: ['info', 'warn', 'error', 'debug'] }).notNull(),
  message: text('message').notNull(),
  meta: text('meta'), // JSON string
  sourceFile: text('source_file').notNull(),
  lineNumber: integer('line_number').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  timestampIdx: index('system_logs_timestamp_idx').on(table.timestamp),
  levelIdx: index('system_logs_level_idx').on(table.level),
  sourceIdx: index('system_logs_source_idx').on(table.sourceFile),
}));
