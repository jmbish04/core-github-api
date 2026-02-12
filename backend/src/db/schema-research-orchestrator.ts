/**
 * @file backend/src/db/schema-research-orchestrator.ts
 * @description D1 schema for Research Orchestrator workflow
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Research sessions track the overall workflow execution
 */
export const researchSessions = sqliteTable("research_sessions", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(), // "trending" | "targeted" | "exploratory"
  query: text("query"),
  status: text("status").notNull(), // "exploring" | "awaiting_approval" | "approved" | "analyzing" | "completed" | "failed"
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
});

/**
 * Repository scores track candidate repos and their evaluation
 */
export const repoScores = sqliteTable("repo_scores", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => researchSessions.id),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  repoId: text("repo_id").notNull(), // "owner/repo"
  
  // Sampling phase
  sampleScore: real("sample_score"), // 0-1 score from initial sampling
  sampleReasoning: text("sample_reasoning"),
  
  // Deep analysis phase
  codeQuality: real("code_quality"), // 0-10
  modularity: real("modularity"), // 0-10
  performance: real("performance"), // 0-10
  security: real("security"), // 0-10
  analysisSummary: text("analysis_summary"),
  
  // Judge phase
  finalScore: real("final_score"), // 0-10
  judgeReasoning: text("judge_reasoning"),
  strengths: text("strengths"), // JSON array
  weaknesses: text("weaknesses"), // JSON array
  recommendation: text("recommendation"), // "highly_relevant" | "relevant" | "not_relevant"
  
  status: text("status").notNull(), // "pending_approval" | "approved" | "analyzed" | "scored"
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Analysis artifacts store detailed analysis outputs
 */
export const analysisArtifacts = sqliteTable("analysis_artifacts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => researchSessions.id),
  repoId: text("repo_id").notNull(),
  artifactType: text("artifact_type").notNull(), // "sample" | "deep_analysis" | "sandbox_result" | "judge_score"
  content: text("content").notNull(), // JSON string
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
