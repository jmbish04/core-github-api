import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const standardizationRules = sqliteTable("standardization_rules", {
  id: text("id").primaryKey(),
  sourceRepo: text("source_repo").notNull().default("jmbish04/core-github-standardization"),
  filePath: text("file_path").notNull(),
  description: text("description"),
  relevantInfra: text("relevant_infra").notNull().default("[]"), // JSON array
  irrelevantInfra: text("irrelevant_infra").notNull().default("[]"), // JSON array
  aiInstructions: text("ai_instructions"),
  shouldOverwrite: integer("should_overwrite", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
