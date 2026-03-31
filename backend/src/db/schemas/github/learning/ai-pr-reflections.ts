/**
 * @file backend/src/db/schemas/github/learning/ai-pr-reflections.ts
 * @description The Contemplation Gate — maps new insights to prior PRs to
 * determine if a fix failed previously and requires template-level immunization
 * instead of a local patch.
 *
 * Before the Learning Agent suggests a code fix, it queries this table to check
 * if the same pattern was addressed before. If a prior fix was unsuccessful,
 * the agent must propose updating global standards (core-github-standardization)
 * instead of toggling the local code again.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const aiPrReflections = sqliteTable(
  "ai_pr_reflections",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    newAiInsightId: text("new_ai_insight_id").notNull(),
    priorAiInsightId: text("prior_ai_insight_id"),
    aiInsightPrId: text("ai_insight_pr_id"),
    agentAnalysis: text("agent_analysis"),
    agentPrSuccessDetermination: text("agent_pr_success_determination"), // success | partial | failure | inconclusive
    vectorId: text("vector_id"), // Reference to Vectorize entry for similarity search
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sessionIdx: index("idx_ai_pr_reflections_session").on(table.sessionId),
    newInsightIdx: index("idx_ai_pr_reflections_new").on(table.newAiInsightId),
    priorInsightIdx: index("idx_ai_pr_reflections_prior").on(
      table.priorAiInsightId
    ),
  })
);

export const selectAiPrReflectionSchema =
  createSelectSchema(aiPrReflections).openapi("AiPrReflection");
export const insertAiPrReflectionSchema =
  createInsertSchema(aiPrReflections).openapi("InsertAiPrReflection");
