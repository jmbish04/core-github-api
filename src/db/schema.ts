/**
 * @file src/db/schema.ts
 * @description Drizzle ORM schema definitions for D1 database tables
 * @owner AI-Builder
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

/**
 * Sessions table - stores user session data
 */
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').unique().notNull(),
  prompt: text('prompt'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
})

/**
 * Searches table - stores search terms for each session
 */
export const searches = sqliteTable('searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  searchTerm: text('search_term').notNull(),
  status: text('status').default('pending'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
})

/**
 * Repository analysis table - stores analyzed repositories
 */
export const repoAnalysis = sqliteTable('repo_analysis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  searchId: integer('search_id').notNull(),
  repoFullName: text('repo_full_name').notNull(),
  repoUrl: text('repo_url'),
  description: text('description'),
  relevancyScore: real('relevancy_score'),
  analyzedAt: text('analyzed_at').default('CURRENT_TIMESTAMP'),
})
