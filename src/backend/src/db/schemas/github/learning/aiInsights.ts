import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningSessions } from "./sessions";
import { learningThreads } from "./threads";

export const learningAiInsights = sqliteTable("learning_ai_insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").references(() => learningSessions.id),
  threadId: integer("thread_id").references(() => learningThreads.id),
  timestamp: text("timestamp")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  category: text("category").notNull(), // e.g., "Global Env"
  insightAnalysis: text("insight_analysis").notNull(),
  suggestedImprovement: text("suggested_improvement"),
  observedAttemptsReview: text("review_of_observed_attempts"),
});

export const selectLearningAiInsightSchema = createSelectSchema(learningAiInsights);
export const insertLearningAiInsightSchema = createInsertSchema(learningAiInsights);
