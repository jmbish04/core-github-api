/**
 * @file schemas/logs/observability.ts
 * @description Drizzle ORM schema for V8.1 observability log persistence.
 *
 * Tables:
 *   - observability_events: SDK diagnostic channel events (RPC, MCP, lifecycle, etc.)
 *   - browser_tool_logs: browser_search / browser_execute invocation records
 *   - web_query_logs: WebQueryWorker subagent parallel query results (mirrored from child SQLite)
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Persists real-time SDK diagnostic channel events forwarded by the
 * observability subscribers (V8-02). This is the cold-path D1 mirror
 * of the in-memory ring buffer consumed by metrics-tap.
 */
export const observabilityEvents = sqliteTable('observability_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** SDK channel name, e.g. 'agents:rpc', 'agents:mcp', 'agents:lifecycle' */
  channel: text('channel').notNull(),
  /** Event type within the channel, e.g. 'rpc:call', 'rpc:error', 'mcp:client:connect' */
  eventType: text('event_type').notNull(),
  /** Agent class name that emitted the event */
  agent: text('agent').notNull(),
  /** Event name / label */
  name: text('name').notNull(),
  /** Full event payload as JSON string */
  payload: text('payload'),
  /** SDK-provided event timestamp (ISO 8601) */
  eventTimestamp: text('event_timestamp').notNull(),
  /** Server capture time (ISO 8601) */
  capturedAt: text('captured_at').notNull(),
});

/**
 * Logs every invocation of the browser_search / browser_execute CDP tools.
 * Used for rate-limit auditing, quota tracking, and debugging.
 */
export const browserToolLogs = sqliteTable('browser_tool_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Agent that requested the browser tool call */
  agentId: text('agent_id').notNull(),
  /** Tool name: 'browser_search' | 'browser_execute' */
  toolName: text('tool_name').notNull(),
  /** Input arguments passed to the tool (JSON) */
  input: text('input'),
  /** Tool output / result summary (JSON, truncated to 4KB) */
  output: text('output'),
  /** Duration of the call in milliseconds */
  durationMs: integer('duration_ms'),
  /** Whether the call succeeded */
  status: text('status').notNull().default('success'),
  /** Error message if the call failed */
  error: text('error'),
  /** ISO 8601 timestamp */
  createdAt: text('created_at').notNull(),
});

/**
 * D1 mirror of WebQueryWorker subagent parallel query results.
 * Each row represents one child subagent's completed query execution.
 * The parent ResearchAgent writes these after aggregating child RPC results.
 */
export const webQueryLogs = sqliteTable('web_query_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Parent execution ID (groups all queries from a single executeParallelWebQueries call) */
  executionId: text('execution_id').notNull(),
  /** Child facet name, e.g. 'web-query-0', 'web-query-1' */
  facetName: text('facet_name').notNull(),
  /** The search query string */
  query: text('query').notNull(),
  /** Execution status: 'pending' | 'success' | 'error' */
  status: text('status').notNull().default('pending'),
  /** Result summary from the child subagent */
  resultSummary: text('result_summary'),
  /** ISO 8601 start timestamp */
  startedAt: text('started_at').notNull(),
  /** ISO 8601 finish timestamp (null while in-progress) */
  finishedAt: text('finished_at'),
});
