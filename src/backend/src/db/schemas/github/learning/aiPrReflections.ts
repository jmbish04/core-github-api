import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningSessions } from "./sessions";
import { learningAiInsights } from "./aiInsights";
import { learningAiInsightPrs } from "./aiInsightPrs";

// Reflections on PR success
export const learningAiPrReflections = sqliteTable(
  "learning_ai_pr_reflections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").references(() => learningSessions.id),
    newInsightId: integer("new_ai_insight_id").references(() => learningAiInsights.id),
    priorInsightId: integer("prior_ai_insight_id").references(() => learningAiInsights.id),
    insightPrId: integer("ai_insight_pr_id").references(() => learningAiInsightPrs.id),
    agentAnalysis: text("agent_analysis"),
    prSuccessDetermination: text("agent_pr_success_determination"),
  }
);

export const selectLearningAiPrReflectionSchema = createSelectSchema(learningAiPrReflections);
export const insertLearningAiPrReflectionSchema = createInsertSchema(learningAiPrReflections);
