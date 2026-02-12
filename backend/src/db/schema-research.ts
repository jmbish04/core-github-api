/**
 * @file src/db/schema-research.ts
 * @description Drizzle ORM schema for Research file records
 * @owner Agentic Research Team
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Research Files Table
 * Each row represents a single file from a researched repository
 * Linked to vectorized chunks via UUID
 */
export const researchFiles = sqliteTable('research_files', {
  // Primary identifier (UUID)
  id: text('id').primaryKey(), // crypto.randomUUID()
  
  // Repository context
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  
  // File metadata
  filename: text('filename').notNull(), // e.g., "index.ts"
  filepath: text('filepath').notNull(), // e.g., "src/index.ts"
  extension: text('extension'), // e.g., ".ts"
  sizeBytes: integer('size_bytes'),
  
  // AI Analysis (JSON)
  analysis: text('analysis', { mode: 'json' }).$type<{
    // Zoomed-in analysis (file in isolation)
    zoomedIn: {
      purpose: string;
      keyFunctions: string[];
      complexity: 'low' | 'medium' | 'high';
      codeQuality: string;
    };
    // Zoomed-out analysis (file in context of repo)
    zoomedOut: {
      role: string;
      importance: 'critical' | 'important' | 'supporting' | 'utility';
      architecturalLayer: string;
    };
    // Dependencies
    fileDependencies: string[]; // What this file imports/requires
    dependenciesOnFile: string[]; // What files depend on this file
  }>(),
  
  // Timestamps
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
}, (table) => ({
  ownerRepoIdx: index('research_owner_repo_idx').on(table.owner, table.repo),
  filepathIdx: index('research_filepath_idx').on(table.filepath),
  createdAtIdx: index('research_created_at_idx').on(table.createdAt),
}));

export type SelectResearchFile = typeof researchFiles.$inferSelect;
export type InsertResearchFile = typeof researchFiles.$inferInsert;
