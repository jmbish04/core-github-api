import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningSessions } from "./sessions";

// ai_insight_prs: PRs made to fix insights
export const learningAiInsightPrs = sqliteTable("learning_ai_insight_prs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").references(() => learningSessions.id),
  timestamp: text("timestamp")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  repoOwner: text("repo_owner").notNull(),
  repoName: text("repo_name").notNull(),
  prNumber: integer("pr_number").notNull(),
  prUrl: text("pr_url").notNull(),
  prDescription: text("pr_description"),
});

export const selectLearningAiInsightPrSchema = createSelectSchema(learningAiInsightPrs);
export const insertLearningAiInsightPrSchema = createInsertSchema(learningAiInsightPrs);
