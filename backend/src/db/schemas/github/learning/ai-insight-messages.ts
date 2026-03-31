/**
 * @file backend/src/db/schemas/github/learning/ai-insight-messages.ts
 * @description Maps AI insights to the specific messages that triggered them.
 * Provides traceability from insight back to source conversation.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const aiInsightMessages = sqliteTable(
  "ai_insight_messages",
  {
    id: text("id").primaryKey(),
    aiInsightId: text("ai_insight_id").notNull(),
    messageId: text("message_id").notNull(),
    sessionId: text("session_id").notNull(),
  },
  (table) => ({
    insightIdx: index("idx_ai_insight_msgs_insight").on(table.aiInsightId),
    messageIdx: index("idx_ai_insight_msgs_message").on(table.messageId),
  })
);

export const selectAiInsightMessageSchema =
  createSelectSchema(aiInsightMessages).openapi("AiInsightMessage");
export const insertAiInsightMessageSchema =
  createInsertSchema(aiInsightMessages).openapi("InsertAiInsightMessage");
