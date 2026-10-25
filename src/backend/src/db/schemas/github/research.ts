// env.DB
import { sqliteTable, text, integer, index, real } from "drizzle-orm/sqlite-core";
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
    sourceId: text("source_id").notNull(), // Exact ID (GitHub Repo ID or Discord Message ID) for Deduplication
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type", { enum: ["github", "blog", "docs", "other", "discord"] }).notNull(),
    initialSummary: text("initial_summary"),
    judgeScore: integer("judge_score"), // 0-100
    judgeReasoning: text("judge_reasoning"),
    userRating: text("user_rating", { enum: ["keep", "discard", "pending"] }).default("pending"),
    metadata: text("metadata", { mode: "json" }),
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


// 5. Research Recommendations - Overhauled deep research findings + HITL
export const researchRecommendations = sqliteTable('research_recommendations', {
  id: text('id').primaryKey(), // Repo full_name e.g., 'cloudflare/workers-sdk'
  topic: text('topic').notNull(),
  repoName: text('repo_name').notNull(),
  repoUrl: text('repo_url').notNull(),
  description: text('description'),
  stars: integer('stars').default(0),
  aiScore: real('ai_score'), // 1-10 scale by the Judge agent
  aiReasoning: text('ai_reasoning'),
  humanRating: integer('human_rating'), // 1-5 scale for HITL
  humanFeedback: text('human_feedback'), // Context on why they liked/disliked
  isReviewed: integer('is_reviewed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// 6. Deep Research Dashboard V2 - Stores configurations for custom runs, cron schedules, and drafts
export const researchProjects = sqliteTable('research_projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  goal: text('goal'),
  type: text('type').notNull(), // 'custom' | 'cron'
  status: text('status').notNull().default('draft'), // 'draft' | 'processing' | 'active' | 'completed' | 'failed'
  globalDeduplication: integer('global_deduplication', { mode: 'boolean' }).default(true).notNull(), 
  cronSchedule: text('cron_schedule'),
  githubTerms: text('github_terms', { mode: 'json' }).$type<string[]>(),
  discordTerms: text('discord_terms', { mode: 'json' }).$type<string[]>(),
  discordSelectedChannels: text('discord_selected_channels', { mode: 'json' }).$type<string[]>(),
  googleTerms: text('google_terms', { mode: 'json' }).$type<string[]>(),
  progress: integer('progress').default(0), // 0 to 100 for real-time tracking
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// 7. Deep Research Dashboard V2 - Stores the actual execution findings/reports
export const researchReports = sqliteTable('research_reports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  findings: text('findings', { mode: 'json' }), // The final report data
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const discordResearchConfigs = sqliteTable('discord_research_configs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  guildId: text('guild_id').notNull(),
  channels: text('channels', { mode: 'json' }).$type<string[]>(), // specific channels
  prompt: text('prompt'), // Custom instruction
  cronSchedule: text('cron_schedule'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const discordScanWatermarks = sqliteTable('discord_scan_watermarks', {
  channelId: text('channel_id').primaryKey(),
  lastMessageId: text('last_message_id'),
  lastMessageTimestamp: text('last_message_timestamp'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});
