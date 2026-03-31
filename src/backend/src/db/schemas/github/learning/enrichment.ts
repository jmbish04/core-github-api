/**
 * @file backend/src/db/schemas/github/learning/enrichment.ts
 * @description Docs MCP grounding data — stores queries sent to the
 * Cloudflare Docs MCP and the AI-derived takeaways from responses.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningEnrichment = sqliteTable(
  "learning_enrichment",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
    queryForMcp: text("query_for_mcp").notNull(),
    mcpResponse: text("mcp_response"),
    aiAnalysis: text("ai_analysis"),
  },
  (table) => ({
    messageIdx: index("idx_learning_enrichment_msg").on(table.messageId),
  })
);

export const selectLearningEnrichmentSchema =
  createSelectSchema(learningEnrichment).openapi("LearningEnrichment");
export const insertLearningEnrichmentSchema =
  createInsertSchema(learningEnrichment).openapi("InsertLearningEnrichment");
