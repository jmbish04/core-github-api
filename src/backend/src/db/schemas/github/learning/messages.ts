import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningSessions } from "./sessions";
import { learningThreads } from "./threads";

export const learningMessages = sqliteTable("learning_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").references(() => learningSessions.id),
  threadId: integer("thread_id").references(() => learningThreads.id),
  timestamp: text("timestamp").notNull(),
  author: text("author").notNull(),
  message: text("message").notNull(),
  aiAnalysis: text("ai_analysis"), // Updated during processing
});

export const selectLearningMessageSchema = createSelectSchema(learningMessages);
export const insertLearningMessageSchema = createInsertSchema(learningMessages);
