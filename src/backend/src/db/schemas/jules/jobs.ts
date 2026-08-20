// env.DB
/**
 * @file backend/src/db/schemas/jules/jobs.ts
 * @description D1 (SQLite/Drizzle) schema for Jules job records.
 *
 * A "Jules job" is a higher-level tracking record that wraps a session.
 * It binds a session to a specific repository and tracks the top-level
 * task status from the perspective of the Worker (not Jules itself).
 *
 * Jobs are used by the `JulesOverseer` to monitor progress and detect
 * sessions that are blocked or inactive.
 *
 * @module DB/Schemas/Jules
 */

import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── jules_jobs ────────────────────────────────────────────────────────────────

/**
 * Top-level job tracking record for a Jules coding task.
 *
 * One job corresponds to one Jules session and one repository target.
 * The `JulesOverseer` monitors all non-completed jobs on a schedule.
 */
export const julesJobs = sqliteTable(
  "jules_jobs",
  {
    /** Auto-incrementing integer primary key. */
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** The Jules session ID this job is tracking. */
    sessionId: text("session_id").notNull(),

    /** Full GitHub repository name in "owner/repo" format. */
    repoFullName: text("repo_full_name").notNull(),

    /** The task prompt originally sent to Jules for this job. */
    prompt: text("prompt").notNull(),

    /**
     * Worker-side status of the job (not Jules's internal status).
     * - pending: session started, waiting for first activity
     * - blocked: Jules detected as stuck, Overseer is intervening
     * - completed: session successfully finished (PR submitted or task done)
     * - failed: unrecoverable error occurred
     */
    status: text("status", {
      enum: ["pending", "blocked", "completed", "failed"],
    })
      .notNull()
      .default("pending"),

    /** Timestamp when the job was created. */
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
  },
  (table) => ({
    statusIdx: index("jules_jobs_status_idx").on(table.status),
    sessionIdIdx: index("jules_jobs_session_id_idx").on(table.sessionId),
  })
);

export type JulesJob = typeof julesJobs.$inferSelect;
export type InsertJulesJob = typeof julesJobs.$inferInsert;
