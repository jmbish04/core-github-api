import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { julesSessions } from "./sessions";

export const julesBuildAnalysis = sqliteTable(
  "jules_build_analysis",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id").references(() => julesSessions.id),
    repoFullName: text("repo_full_name").notNull(),
    prNumber: integer("pr_number"),
    julesPrompt: text("jules_prompt"),
    julesResponse: text("jules_response"),
    rawLogs: text("raw_logs"),
    status: text("status", {
      enum: ["analyzed", "queued_for_approval", "implemented"],
    })
      .notNull()
      .default("analyzed"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIdx: index("jules_build_analysis_status_idx").on(table.status),
    repoIdx: index("jules_build_analysis_repo_idx").on(table.repoFullName),
    sessionIdx: index("jules_build_analysis_session_idx").on(table.sessionId),
  })
);

export type JulesBuildAnalysis = typeof julesBuildAnalysis.$inferSelect;
export type InsertJulesBuildAnalysis = typeof julesBuildAnalysis.$inferInsert;
