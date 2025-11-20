/**
 * @file src/db/schema.ts
 * @description Drizzle ORM schema definitions for all D1 tables
 * @owner AI-Builder
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Request logs table - stores HTTP request logs for monitoring
 */
export const requestLogs = sqliteTable('request_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  status: integer('status').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  payloadSizeBytes: integer('payload_size_bytes').notNull(),
  correlationId: text('correlation_id').notNull(),
  metadata: text('metadata'),
}, (table) => ({
  timestampIdx: index('idx_request_logs_timestamp').on(table.timestamp),
  correlationIdIdx: index('idx_request_logs_correlation_id').on(table.correlationId),
}))

/**
 * Sessions table - stores user session information for agent workflows
 */
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').unique(),
  prompt: text('prompt'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
})

/**
 * Searches table - stores search term information for repository discovery
 */
export const searches = sqliteTable('searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  searchTerm: text('search_term'),
  status: text('status').default('pending'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
})

/**
 * Repository analysis table - stores AI analysis results for discovered repositories
 */
export const repoAnalysis = sqliteTable('repo_analysis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  searchId: integer('search_id'),
  repoFullName: text('repo_full_name'),
  repoUrl: text('repo_url'),
  description: text('description'),
  relevancyScore: real('relevancy_score'),
  analyzedAt: text('analyzed_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  // Unique constraint on session_id and repo_full_name combination
  sessionRepoUnique: uniqueIndex('repo_analysis_session_id_repo_full_name_unique').on(
    table.sessionId,
    table.repoFullName
  ),
}))

/**
 * GitHub management config table - stores GitHub workflow retrofit operations
 */
export const ghManagementConfig = sqliteTable('gh_management_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  repoName: text('repo_name').notNull(),
  action: text('action').notNull(),
  status: text('status').notNull(),
  statusDetails: text('status_details'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  timestampIdx: index('idx_gh_management_config_timestamp').on(table.timestamp),
  repoNameIdx: index('idx_gh_management_config_repo_name').on(table.repoName),
  actionIdx: index('idx_gh_management_config_action').on(table.action),
  statusIdx: index('idx_gh_management_config_status').on(table.status),
}))
