/**
 * @file backend/src/db/schemas/jules/sessions.ts
 * @description D1 (SQLite/Drizzle) schema for Jules AI coding sessions.
 *
 * A "Jules session" is a single long-running autonomous coding task delegated
 * to the Google Jules coding agent. Each session tracks:
 *   - The originating specialist agent and project
 *   - The full enriched prompt sent to Jules
 *   - The live status (active, completed, failed, stuck)
 *   - Repo context (owner / name / branch)
 *   - Webhook-related timestamps for the live-feed subsystem
 *
 * @module DB/Schemas/Jules
 */

import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── jules_sessions ────────────────────────────────────────────────────────────

/**
 * Tracks every Jules coding session initiated from this Worker.
 *
 * Lifecycle:
 *   active → completed | failed | stuck | waiting_for_user
 *
 * Populated by:
 *   - `JulesService.startSession()` on session creation
 *   - Webhook handlers when Jules reports progress or events
 *   - `JulesOverseer` cron on inactivity detection
 */
export const julesSessions = sqliteTable(
  "jules_sessions",
  {
    /** Jules SDK-assigned session identifier (primary key). */
    id: text("id").primaryKey(),

    /** ID of the project this session belongs to, if initiated from a project context. */
    projectId: text("project_id"),

    /** Planning request ID when the session belongs to the planning subsystem. */
    planningRequestId: text("planning_request_id"),

    /**
     * ID of the specialist agent (Durable Object instance name) that created this session.
     * Allows the webhook handler to re-instantiate the correct agent.
     */
    agentId: text("agent_id"),

    /**
     * Class name of the specialist agent (e.g. "WorkshopAgent", "CloudflareDocs").
     * Used for agent re-instantiation when routing Jules webhook events.
     */
    specialistClass: text("specialist_class"),

    /** Logical session role (planning, implementation, stitch, etc.). */
    sessionRole: text("session_role"),

    /** The full enriched prompt sent to Jules (includes webhook instructions and coding-agent standards). */
    prompt: text("prompt").notNull(),

    /** Current lifecycle status of the Jules session. */
    status: text("status", {
      enum: ["active", "completed", "failed", "stuck", "waiting_for_user"],
    })
      .notNull()
      .default("active"),

    // ── Repository context ──────────────────────────────────────────────────

    /** GitHub repository owner (org or user). */
    repoOwner: text("repo_owner"),

    /** GitHub repository name (without owner prefix). */
    repoName: text("repo_name"),

    /** Target branch for Jules to work on. Defaults to "main". */
    branch: text("branch"),

    // ── Tracking timestamps ─────────────────────────────────────────────────

    /** ISO timestamp when the session was created. */
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),

    /** ISO timestamp when the session record was last updated. */
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),

    /** ISO timestamp of the last detected Jules activity (stream event, message, or webhook). */
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),

    /** ISO timestamp when the last webhook event was received from Jules. */
    webhookReceivedAt: integer("webhook_received_at", { mode: "timestamp" }),

    // ── Overseer metrics ────────────────────────────────────────────────────

    /** Number of times the JulesOverseer AI has intervened to unblock this session. */
    assistanceCount: integer("assistance_count").default(0),

    /** Whether this session currently requires manual human attention. */
    requiresUserAttention: integer("requires_user_attention", {
      mode: "boolean",
    }).default(false),

    /** Arbitrary JSON metadata for future extensibility. */
    metadataJson: text("metadata_json"),
  },
  (table) => ({
    statusIdx: index("jules_sessions_status_idx").on(table.status),
    projectIdx: index("jules_sessions_project_idx").on(table.projectId),
    planningRequestIdx: index("jules_sessions_planning_request_idx").on(table.planningRequestId),
    agentIdx: index("jules_sessions_agent_idx").on(table.agentId),
    createdIdx: index("jules_sessions_created_idx").on(table.createdAt),
    lastActivityIdx: index("jules_sessions_last_activity_idx").on(
      table.lastActivityAt
    ),
  })
);

export type JulesSession = typeof julesSessions.$inferSelect;
export type InsertJulesSession = typeof julesSessions.$inferInsert;
