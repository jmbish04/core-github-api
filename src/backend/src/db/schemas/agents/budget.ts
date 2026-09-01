// env.DB
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * AI Cost Logs - Track AI model usage and costs
 */
export const aiCostLogs = sqliteTable('ai_cost_logs', {
  id: text('id').primaryKey(), // UUID
  sessionId: text('session_id'),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  estimatedCost: real('estimated_cost').notNull().default(0),
  documentId: text('document_id'),
  workflowName: text('workflow_name'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  sessionIdx: index('ai_cost_logs_session_idx').on(table.sessionId),
  timestampIdx: index('ai_cost_logs_timestamp_idx').on(table.timestamp),
  modelIdx: index('ai_cost_logs_model_idx').on(table.model),
}));

/**
 * Budget Events - Track budget thresholds and alerts
 */
export const budgetEvents = sqliteTable('budget_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type', { enum: ['warning', 'limit', 'reset'] }).notNull(),
  threshold: real('threshold').notNull(),
  currentSpend: real('current_spend').notNull(),
  message: text('message').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  timestampIdx: index('budget_events_timestamp_idx').on(table.timestamp),
  typeIdx: index('budget_events_type_idx').on(table.eventType),
}));
