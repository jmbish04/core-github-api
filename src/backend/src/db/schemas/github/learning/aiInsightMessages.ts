import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningAiInsights } from "./aiInsights";
import { learningMessages } from "./messages";
import { learningSessions } from "./sessions";

export const learningAiInsightMessages = sqliteTable("learning_ai_insight_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  aiInsightId: integer("ai_insight_id").references(() => learningAiInsights.id),
  messageId: integer("message_id").references(() => learningMessages.id),
  sessionId: integer("session_id").references(() => learningSessions.id),
});

export const selectLearningAiInsightMessageSchema = createSelectSchema(learningAiInsightMessages);
export const insertLearningAiInsightMessageSchema = createInsertSchema(learningAiInsightMessages);
