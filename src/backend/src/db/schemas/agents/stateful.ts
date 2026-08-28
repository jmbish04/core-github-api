/**
 * @file src/db/schemas/agents/stateful.ts
 * @description Drizzle ORM wrapper for Durable Object agent SQLite stateful storage.
 *   Uses drizzle-orm/durable-sqlite to give agents typed, ORM-based DB access.
 *
 *   `migrateAgentDb()` runs idempotent CREATE TABLE IF NOT EXISTS DDL using the DO's
 *   native `storage.sql.exec()` API — the correct pattern for Cloudflare Workers runtime
 *   where filesystem-based migration tools (drizzle-kit) are unavailable at runtime.
 *
 *   Call inside `ctx.blockConcurrencyWhile()` to guarantee the schema is applied before
 *   any incoming requests are processed.
 */

import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import * as schema from "./events";

export type AgentDb = DrizzleSqliteDODatabase<typeof schema>;

/**
 * Create a Drizzle ORM instance backed by a Durable Object's SQLite storage.
 * @param storage - `this.ctx.storage` from inside the DO class.
 */
export function getAgentDb(storage: DurableObjectStorage): AgentDb {
  return drizzle(storage, { schema }) as AgentDb;
}

/**
 * Apply idempotent schema DDL to the DO's embedded SQLite database.
 *
 * Uses `storage.sql.exec()` directly — the only viable approach inside a Cloudflare
 * Worker where the filesystem is unavailable and drizzle-kit's file-based migrator
 * (`{ migrationsFolder }`) cannot be used at runtime.
 *
 * @param storage - `this.ctx.storage` from the DO constructor.
 */
export function migrateAgentDb(storage: DurableObjectStorage): void {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      action TEXT,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT,
      actor_login TEXT,
      actor_avatar TEXT,
      repo_name TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);

    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      workflow TEXT NOT NULL,
      event_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_automation_runs_event ON automation_runs (event_id);

    CREATE TABLE IF NOT EXISTS agent_activities (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      step_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      details TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT status_check CHECK(status IN ('pending','active','completed','failed'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_activities_op ON agent_activities (operation_id);

    CREATE TABLE IF NOT EXISTS pr_manager_jobs (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pull_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pr_manager_jobs_repo_pull ON pr_manager_jobs (repo, pull_number);
  `);
}

export { schema as agentSchema };
