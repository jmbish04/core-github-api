/**
 * @file backend/src/db/schemas/github/learning/ai-insights.ts
 * @description AI-detected architectural patterns, anti-patterns, and
 * improvement suggestions. The core output of the Learning Engine.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const aiInsights = sqliteTable(
  "ai_insights",
  {
    id: text("id").primaryKey(),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
    category: text("category").notNull(), // e.g. 'Global Env', 'Style Drift', 'Dependency', 'Performance', 'Security'
    severity: text("severity").notNull().default("medium"), // low | medium | high | critical
    insightAnalysis: text("insight_analysis").notNull(),
    suggestedImprovement: text("suggested_improvement"),
    reviewOfObservedAttempts: text("review_of_observed_attempts"),
    confidence: real("confidence"),
    threadId: text("thread_id"),
    sessionId: text("session_id"),
    status: text("status").notNull().default("PENDING"), // PENDING | IN_VERIFICATION | IMMUNIZED | REVERTED | OBSERVED
    githubRepo: text("github_repo"), // nullable for global insights
    resolvedAt: text("resolved_at"),
  },
  (table) => ({
    statusIdx: index("idx_ai_insights_status").on(table.status),
    repoIdx: index("idx_ai_insights_repo").on(table.githubRepo),
    categoryIdx: index("idx_ai_insights_category").on(table.category),
    sessionIdx: index("idx_ai_insights_session").on(table.sessionId),
  })
);

export const selectAiInsightSchema =
  createSelectSchema(aiInsights).openapi("AiInsight");
export const insertAiInsightSchema =
  createInsertSchema(aiInsights).openapi("InsertAiInsight");
