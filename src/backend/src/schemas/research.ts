/**
 * @file backend/src/schemas/research.ts
 * @description Zod schemas for Research Orchestrator workflow
 */

import { z } from "zod";

export const ResearchWorkflowParams = z.object({
  mode: z.enum(["trending", "targeted", "exploratory"]).describe("Research mode"),
  query: z.string().optional().describe("Search query for targeted research"),
  maxCandidates: z.number().default(5).describe("Maximum number of candidate repos"),
  requireApproval: z.boolean().default(true).describe("Require human approval before deep analysis"),
});

export type ResearchWorkflowParams = z.infer<typeof ResearchWorkflowParams>;

export const CandidateRepo = z.object({
  owner: z.string(),
  repo: z.string(),
  stars: z.number(),
  description: z.string(),
  language: z.string().nullable(),
  sampleScore: z.number().min(0).max(1).describe("Initial sampling score (0-1)"),
  reasoning: z.string().describe("Why this repo was selected"),
});

export type CandidateRepo = z.infer<typeof CandidateRepo>;

export const DeepAnalysis = z.object({
  repoId: z.string().describe("owner/repo identifier"),
  codeQuality: z.number().min(0).max(10).describe("Code quality score"),
  modularity: z.number().min(0).max(10).describe("Modularity score"),
  performance: z.number().min(0).max(10).describe("Performance optimization score"),
  security: z.number().min(0).max(10).describe("Security best practices score"),
  summary: z.string().describe("Technical analysis summary"),
  artifacts: z.array(z.string()).describe("Analysis artifact IDs"),
});

export type DeepAnalysis = z.infer<typeof DeepAnalysis>;

export const JudgeScore = z.object({
  repoId: z.string(),
  overallScore: z.number().min(0).max(10).describe("Overall score (0-10)"),
  reasoning: z.string().describe("Detailed reasoning for the score"),
  strengths: z.array(z.string()).describe("Key strengths identified"),
  weaknesses: z.array(z.string()).describe("Key weaknesses identified"),
  recommendation: z.enum(["highly_relevant", "relevant", "not_relevant"]).describe("Final recommendation"),
});

export type JudgeScore = z.infer<typeof JudgeScore>;

export const ResearchSessionStatus = z.enum([
  "exploring",
  "awaiting_approval",
  "approved",
  "analyzing",
  "completed",
  "failed",
]);

export type ResearchSessionStatus = z.infer<typeof ResearchSessionStatus>;
