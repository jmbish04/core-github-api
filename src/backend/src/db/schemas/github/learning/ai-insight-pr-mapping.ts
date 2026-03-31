/**
 * @file backend/src/db/schemas/github/learning/ai-insight-pr-mapping.ts
 * @description Links AI insights to the PRs they influenced or were derived from.
 * Includes AI rationale and success criteria for evaluating fix effectiveness.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const aiInsightPrMapping = sqliteTable(
  "ai_insight_pr_mapping",
  {
    insightId: text("insight_id").notNull(),
    insightPrId: text("insight_pr_id").notNull(),
    aiRationale: text("ai_rationale"),
    aiSuccessCriteria: text("ai_success_criteria"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.insightId, table.insightPrId] }),
    insightIdx: index("idx_ai_pr_mapping_insight").on(table.insightId),
    prIdx: index("idx_ai_pr_mapping_pr").on(table.insightPrId),
  })
);

export const selectAiInsightPrMappingSchema =
  createSelectSchema(aiInsightPrMapping).openapi("AiInsightPrMapping");
export const insertAiInsightPrMappingSchema =
  createInsertSchema(aiInsightPrMapping).openapi("InsertAiInsightPrMapping");
