/**
 * @file backend/src/db/schemas/github/learning/threads.ts
 * @description Conversational threads tracked by the Learning Engine.
 * Each thread maps to a Jules session, Stitch design flow, or GitHub PR conversation.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningThreads = sqliteTable(
  "learning_threads",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
    source: text("source").notNull(), // jules | stitch | github
    sourceIdentifier: text("source_identifier").unique(),
    githubRepo: text("github_repo"),
    title: text("title"),
    category: text("category"),
  },
  (table) => ({
    sessionIdx: index("idx_learning_threads_session").on(table.sessionId),
    sourceIdx: index("idx_learning_threads_source").on(table.source),
    repoIdx: index("idx_learning_threads_repo").on(table.githubRepo),
  })
);

export const selectLearningThreadSchema =
  createSelectSchema(learningThreads).openapi("LearningThread");
export const insertLearningThreadSchema =
  createInsertSchema(learningThreads).openapi("InsertLearningThread");
