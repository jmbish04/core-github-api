/**
 * @file backend/src/db/schemas/github/learning/ai-insight-prs.ts
 * @description Tracks pull requests analyzed by the Learning Engine.
 * Stores PR metadata and outcome for reflection analysis.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const aiInsightPrs = sqliteTable(
  "ai_insight_prs",
  {
    id: text("id").primaryKey(),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    prNumber: integer("pr_number").notNull(),
    prUrl: text("pr_url"),
    prDescription: text("pr_description"),
    sessionId: text("session_id"),
    outcome: text("outcome").notNull().default("OPEN"), // OPEN | MERGED | CLOSED | REVERTED
  },
  (table) => ({
    repoIdx: index("idx_ai_insight_prs_repo").on(
      table.repoOwner,
      table.repoName
    ),
    outcomeIdx: index("idx_ai_insight_prs_outcome").on(table.outcome),
    prIdx: index("idx_ai_insight_prs_pr").on(
      table.repoOwner,
      table.repoName,
      table.prNumber
    ),
  })
);

export const selectAiInsightPrSchema =
  createSelectSchema(aiInsightPrs).openapi("AiInsightPr");
export const insertAiInsightPrSchema =
  createInsertSchema(aiInsightPrs).openapi("InsertAiInsightPr");
