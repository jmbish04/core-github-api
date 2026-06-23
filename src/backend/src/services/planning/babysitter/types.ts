import { z } from "zod";

export interface CapturedPlanStep {
  id?: string;
  index?: number;
  title: string;
  description?: string;
}

export interface CapturedAgentMessage {
  id: string;
  createTime: string;
  message: string;
}

export interface CapturedProgressUpdate {
  id: string;
  createTime: string;
  title: string;
  description: string;
}

export interface CapturedDiffSummaryFile {
  path: string;
  changeType?: string;
  additions?: number;
  deletions?: number;
}

export interface CapturedDiffSummary {
  activityId: string;
  createTime: string;
  files: CapturedDiffSummaryFile[];
}

export interface PlanningCaptureState {
  seenActivityIds: string[];
  planSteps: CapturedPlanStep[];
  agentMessages: CapturedAgentMessage[];
  progressUpdates: CapturedProgressUpdate[];
  diffSummaries: CapturedDiffSummary[];
  completedAt?: string;
  failedReason?: string;
}

export interface PlanningSessionResultSummary {
  state?: string;
  error?: unknown;
  rawResult?: unknown;
  outputs?: {
    pullRequests: Array<{ title: string; number: number; url: string }>;
    changeSets: Array<{ filename: string; content: string }>;
    generatedFiles: Array<{ path: string; content: string }>;
  };
}

export const PlanningTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  requirements: z.array(z.string()).default([]),
  successCriteria: z.array(z.string()).default([]),
  docsQueries: z.array(z.string()).default([]),
  assignee: z.string().optional(),
});

export const PlanningStorySchema = z.object({
  title: z.string(),
  description: z.string(),
  docsQueries: z.array(z.string()).default([]),
  tasks: z.array(PlanningTaskSchema).default([]),
});

export const PlanningEpicSchema = z.object({
  title: z.string(),
  description: z.string(),
  docsQueries: z.array(z.string()).default([]),
  stories: z.array(PlanningStorySchema).default([]),
});

export const PlanningBreakdownSchema = z.object({
  title: z.string(),
  summary: z.string(),
  epics: z.array(PlanningEpicSchema).default([]),
});

export type PlanningBreakdown = z.infer<typeof PlanningBreakdownSchema>;
