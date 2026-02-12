/**
 * @file src/db/schema-agent-events.ts
 * @description Drizzle schema for Durable Object agent SQLite tables.
 *   Used by RepoAgent and OwnerAgent for type-safe event storage.
 */

import {
  sqliteTable,
  text,
  index,
} from "drizzle-orm/sqlite-core";

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
