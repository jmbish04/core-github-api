import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// 1. Research Briefs - The high-level user request
export const researchBriefs = sqliteTable(
  "research_briefs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id"), // Optional if relying on auth context
    title: text("title").notNull(),
    rawBriefContent: text("raw_brief_content", { mode: "json" }).notNull(), // JSON: { request: "...", constraints: "..." }
    status: text("status", { enum: ["draft", "planning", "researching", "review", "complete", "failed"] }).default("draft").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  },
  (t) => ({
    userIdIdx: index("research_briefs_user_id_idx").on(t.userId),
    statusIdx: index("research_briefs_status_idx").on(t.status),
  })
);

// 2. Research Plans - Iterative plan negotiation
export const researchPlans = sqliteTable(
  "research_plans",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    briefId: text("brief_id").references(() => researchBriefs.id).notNull(),
    currentVersion: text("current_version", { mode: "json" }).notNull(), // JSON structure of the plan
    userFeedback: text("user_feedback"),
    isApproved: integer("is_approved", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  },
  (t) => ({
    briefIdIdx: index("research_plans_brief_id_idx").on(t.briefId),
  })
);

// 3. Research Candidates - Found items (URLs, repos)
export const researchCandidates = sqliteTable(
  "research_candidates",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    briefId: text("brief_id").references(() => researchBriefs.id).notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type", { enum: ["github", "blog", "docs", "other"] }).notNull(),
    initialSummary: text("initial_summary"),
    judgeScore: integer("judge_score"), // 0-100
    judgeReasoning: text("judge_reasoning"),
    userRating: text("user_rating", { enum: ["keep", "discard", "pending"] }).default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  },
  (t) => ({
    briefIdIdx: index("research_candidates_brief_id_idx").on(t.briefId),
    urlIdx: index("research_candidates_source_url_idx").on(t.sourceUrl),
  })
);

// 4. Research Execution Logs - "Black Box" auditing
export const researchExecutionLogs = sqliteTable(
  "research_execution_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    briefId: text("brief_id").references(() => researchBriefs.id), // Can be null if global system log
    runId: text("run_id"), // UUID to group a specific workflow run
    agentName: text("agent_name").notNull(),
    stepName: text("step_name").notNull(),
    logLevel: text("log_level", { enum: ["info", "thought", "tool_input", "tool_output", "error"] }).notNull(),
    content: text("content").notNull(),
    metadata: text("metadata", { mode: "json" }), // JSON: { tokens: 100, toolArgs: {...} }
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  },
  (t) => ({
    briefIdIdx: index("research_execution_logs_brief_id_idx").on(t.briefId),
    runIdIdx: index("research_execution_logs_run_id_idx").on(t.runId),
    createdAtIdx: index("research_execution_logs_created_at_idx").on(t.createdAt),
  })
);


