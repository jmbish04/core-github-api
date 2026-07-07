/**
 * @file src/db/schema-agent-events.ts
 * @description Drizzle schema for Durable Object agent SQLite tables.
 *   Used by RepoAgent and OwnerAgent for type-safe event storage.
 */

import {
  sqliteTable,
  text,
  integer,
  sqliteTableCreator,
  check,
  index,
} from "drizzle-orm/sqlite-core";

import { sql } from "drizzle-orm";

// ── events ──────────────────────────────────────────────────────

export const agentEvents = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    action: text("action"),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    actorLogin: text("actor_login"),
    actorAvatar: text("actor_avatar"),
    repoName: text("repo_name"),
    timestamp: text("timestamp").notNull(),
  },
  (table) => ({
    timestampIdx: index("idx_events_timestamp").on(table.timestamp),
  })
);

// ── automation_runs (OwnerAgent only) ───────────────────────────

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    ruleName: text("rule_name").notNull(),
    workflow: text("workflow").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => agentEvents.id),
    status: text("status").notNull().default("pending"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => ({
    eventIdx: index("idx_automation_runs_event").on(table.eventId),
  })
);

// Agent activities timeline table
// ── agent_activities ───────────────────────────
export const agentActivities = sqliteTable(
    "agent_activities",
    {
        id: text("id").primaryKey(), // UUID
        operationId: text("operation_id").notNull(),
        stepName: text("step_name").notNull(),
        status: text("status")
            .notNull()
            .default("pending"),
        details: text("details"),
        timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
    },
    (table) => ({
        opIdx: index("idx_agent_activities_op").on(table.operationId),
        statusCheck: check("status_check", sql`${table.status} IN ('pending','active','completed','failed')`)
    })
);

// ── pr_manager_jobs ───────────────────────────
export const prManagerJobs = sqliteTable(
  "pr_manager_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    pullNumber: integer("pull_number").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    createdIdx: index("idx_pr_manager_jobs_created_at").on(table.createdAt),
  })
);
