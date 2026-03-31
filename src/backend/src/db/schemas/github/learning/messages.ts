/**
 * @file backend/src/db/schemas/github/learning/messages.ts
 * @description Individual messages within learning threads.
 * Stores the raw message content and AI-generated analysis.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningMessages = sqliteTable(
  "learning_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    threadId: text("thread_id").notNull(),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
    author: text("author").notNull(),
    message: text("message").notNull(),
    aiAnalysis: text("ai_analysis"),
  },
  (table) => ({
    threadIdx: index("idx_learning_messages_thread").on(table.threadId),
    sessionIdx: index("idx_learning_messages_session").on(table.sessionId),
  })
);

export const selectLearningMessageSchema =
  createSelectSchema(learningMessages).openapi("LearningMessage");
export const insertLearningMessageSchema =
  createInsertSchema(learningMessages).openapi("InsertLearningMessage");
