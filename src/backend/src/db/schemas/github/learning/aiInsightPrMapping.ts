import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningAiInsights } from "./aiInsights";
import { learningAiInsightPrs } from "./aiInsightPrs";

// Mapping insights to PRs
export const learningAiInsightPrMapping = sqliteTable(
  "learning_ai_insight_pr_mapping",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    insightId: integer("insight_id").references(() => learningAiInsights.id),
    insightPrId: integer("insight_pr_id").references(() => learningAiInsightPrs.id),
    aiRationale: text("ai_rationale"),
    aiSuccessCriteria: text("ai_success_criteria"),
  }
);

export const selectLearningAiInsightPrMappingSchema = createSelectSchema(learningAiInsightPrMapping);
export const insertLearningAiInsightPrMappingSchema = createInsertSchema(learningAiInsightPrMapping);
