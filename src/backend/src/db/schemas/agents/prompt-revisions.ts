import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Tracks every change to the Cloudflare Docs Agent system prompt.
 * `removed_language` = lines only in the prior prompt
 * `added_language`   = lines only in the new prompt
 */
export const promptRevisions = sqliteTable("prompt_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull().default(sql`CURRENT_TIMESTAMP`),
  prior_config_prompt: text("prior_config_prompt").notNull(),
  new_config_prompt_value: text("new_config_prompt_value").notNull(),
  removed_language: text("removed_language"),
  added_language: text("added_language"),
  changed_by: text("changed_by").notNull().default("ui"),
});

export type PromptRevision = typeof promptRevisions.$inferSelect;
export type NewPromptRevision = typeof promptRevisions.$inferInsert;
