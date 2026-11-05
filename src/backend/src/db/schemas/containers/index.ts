// env.DB
/**
 * @file src/db/schema-repos.ts
 * @description Drizzle schema for Repositories and AI Metadata.
 * @owner AI-Builder
 */


import {
    sqliteTable,
    text,
    integer,
    real,
    primaryKey,
    index,
} from "drizzle-orm/sqlite-core";

// ----------------------
// container_logs
// ----------------------
export const containerLogs = sqliteTable('container_logs', {
    id: text('id').primaryKey(),
    repoId: integer('repo_id'),
    command: text('command'),
    status: text('status'),
    output: text('output'),
    createdAt: text('created_at')
});