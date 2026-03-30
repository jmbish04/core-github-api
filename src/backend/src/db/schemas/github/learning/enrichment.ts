import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningMessages } from "./messages";

export const learningEnrichment = sqliteTable("learning_enrichment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").references(() => learningMessages.id),
  timestamp: text("timestamp")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  queryForMcp: text("query_for_mcp").notNull(),
  mcpResponse: text("mcp_response"),
  aiAnalysis: text("ai_analysis"), // workers-ai takeaways based on MCP context
});

export const selectLearningEnrichmentSchema = createSelectSchema(learningEnrichment);
export const insertLearningEnrichmentSchema = createInsertSchema(learningEnrichment);
