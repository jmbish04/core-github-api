/**
 * @file src/ai/agents/ResearchAgent/types.ts
 * @description Type definitions for the ResearchAgent — manages multi-source
 *              research across web, GitHub, Discord, and Cloudflare changelog.
 */

import type { PersistentAgentState } from '@/ai/providers';
export type ResearchSource = "web" | "github" | "discord" | "cloudflare-changelog" | "mixed";

export interface ResearchQuery {
  topic: string;
  sources: ResearchSource[];
  depth: "shallow" | "deep";
  maxResults?: number;
  context?: string;
}

export interface ResearchResult {
  query: ResearchQuery;
  findings: ResearchFinding[];
  summary: string;
  confidence: number;       // 0–100
  completedAt: string;
}

export interface ResearchFinding {
  source: ResearchSource;
  title: string;
  content: string;
  url?: string;
  relevanceScore: number;  // 0–1
  metadata?: Record<string, unknown>;
}

// export interface ResearchState {
//   activeResearch: Record<string, ResearchQuery>;
//   completedResearch: Record<string, ResearchResult>;
//   history: Record<string, unknown[]>;
//   status: 'idle' | 'researching' | 'completed' | 'error';
// }

export type ResearchState = PersistentAgentState;

// ── Intelligence Hub Types (v2) ─────────────────────────────────────

export type TrackedSourceType = 'rss' | 'discord' | 'github_search' | 'web_search';
export type PollFrequency = 'hourly' | 'daily' | 'weekly';
export type ResearchProposalTarget = 'template-repo' | 'guardrail-rules' | 'core-github-api' | 'worker-specific';
