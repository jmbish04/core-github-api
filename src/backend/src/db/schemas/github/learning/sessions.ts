/**
 * @file backend/src/db/schemas/github/learning/sessions.ts
 * @description Learning session tracking — each session represents one
 * ingestion/analysis run of the Sentinel Learning Engine.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningSessions = sqliteTable(
  "learning_sessions",
  {
    id: text("id").primaryKey(),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
    triggerType: text("trigger_type").notNull().default("cron"),
    status: text("status").notNull().default("pending"),
    actionTaken: integer("action_taken", { mode: "boolean" }).default(false),
    actionRationale: text("action_rationale"),
    completedAt: text("completed_at"),
    metadataJson: text("metadata_json"),
  },
  (table) => ({
    statusIdx: index("idx_learning_sessions_status").on(table.status),
    timestampIdx: index("idx_learning_sessions_ts").on(table.timestamp),
  })
);

export const selectLearningSessionSchema =
  createSelectSchema(learningSessions).openapi("LearningSession");
export const insertLearningSessionSchema =
  createInsertSchema(learningSessions).openapi("InsertLearningSession");
