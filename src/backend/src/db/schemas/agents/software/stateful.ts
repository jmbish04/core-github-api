/**
 * @file src/db/schemas/agents/software/stateful.ts
 * @description Drizzle ORM schema for EngineerAgent's embedded DO SQLite database.
 * Tracks fleet sessions and milestone state inside the Engineer DO. Mirrored to
 * D1 (agentStateMirror, chatRoomLogs, julesSessions) for eviction recovery.
 */

import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const sweFleetSessions = sqliteTable(
  "swe_fleet_sessions",
  {
    id: text("id").primaryKey(),                       // Jules session ID
    requestId: text("request_id").notNull(),
    role: text("role", { enum: ["solo", "fleet-member", "stitch", "merge"] }).notNull(),
    status: text("status", {
      enum: ["active", "completed", "failed", "stuck", "waiting_for_user"],
    }).notNull().default("active"),
    promptHash: text("prompt_hash"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
  },
  (t) => ({
    requestIdx: index("idx_swe_fleet_request").on(t.requestId),
    statusIdx: index("idx_swe_fleet_status").on(t.status),
  }),
);

export const sweMilestones = sqliteTable(
  "swe_milestones",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    sessionId: text("session_id"),                    // null for planning-only milestones
    name: text("name").notNull(),                     // 'brain:evaluate', 'jules:session-1', etc.
    status: text("status", {
      enum: ["staged", "in_progress", "pending_review", "blocked", "complete", "failed"],
    }).notNull().default("staged"),
    detail: text("detail"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
  },
  (t) => ({
    requestIdx: index("idx_swe_milestone_request").on(t.requestId),
  }),
);

// ─── DO SQLite wiring ───────────────────────────────────────────────────────

export const engineerSchema = { sweFleetSessions, sweMilestones };
export type EngineerDb = DrizzleSqliteDODatabase<typeof engineerSchema>;

export function getEngineerDb(storage: DurableObjectStorage): EngineerDb {
  return drizzle(storage, { schema: engineerSchema }) as EngineerDb;
}

/**
 * Apply idempotent DDL inside the DO. Call from `ctx.blockConcurrencyWhile()`
 * in `onStart()` to guarantee the schema exists before any incoming RPC.
 */
export function migrateEngineerDb(storage: DurableObjectStorage): void {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS swe_fleet_sessions (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('solo','fleet-member','stitch','merge')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','stuck','waiting_for_user')),
      prompt_hash TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_swe_fleet_request ON swe_fleet_sessions (request_id);
    CREATE INDEX IF NOT EXISTS idx_swe_fleet_status ON swe_fleet_sessions (status);

    CREATE TABLE IF NOT EXISTS swe_milestones (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      session_id TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','in_progress','pending_review','blocked','complete','failed')),
      detail TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_swe_milestone_request ON swe_milestones (request_id);
  `);
}
