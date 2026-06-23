/**
 * @file src/ai/agents/GuardrailAgent/types.ts
 * @description Type definitions for the GuardrailAgent — the exclusive owner
 *              of Cloudflare golden-path enforcement (Lock L4).
 */

/** Verdict returned after evaluating a code/config payload. */
export type VerdictStatus = "pass" | "warn" | "fail";

export interface Verdict {
  status: VerdictStatus;
  score: number;                    // 0–100 quality score
  issues: VerdictIssue[];
  corrections: CorrectionPrompt[];
  evaluatedAt: string;              // ISO timestamp
}

export interface VerdictIssue {
  severity: "info" | "warning" | "error" | "critical";
  rule: string;                     // e.g. 'no-raw-sql', 'use-agents-sdk'
  file?: string;
  line?: number;
  message: string;
  docsUrl?: string;                 // Link to Cloudflare docs
}

export interface CorrectionPrompt {
  file: string;
  original: string;
  corrected: string;
  explanation: string;
}

/** Input payload for the main evaluate() RPC. */
export interface EvaluationPayload {
  requestId: string;
  source: string;                   // Agent that requested evaluation
  files: EvaluationFile[];
  context?: string;                 // Additional context about the change
}

export interface EvaluationFile {
  path: string;
  content: string;
  language?: string;
}

import type { PersistentAgentState } from '@/ai/providers';

/** State persisted in the GuardrailAgent DO SQLite. */
export interface GuardrailState extends PersistentAgentState {
  /** Recent evaluation results keyed by requestId. */
  evaluations: Record<string, Verdict>;
  /** Cached Cloudflare docs snippets for hot-path lookups. */
  goldenPathCache: Record<string, string>;
}

/** Health probe response shape. */
export interface GuardrailHealth {
  status: "ok" | "degraded" | "error";
  agent: "GuardrailAgent";
  timestamp: string;
  cachedRules: number;
  recentEvaluations: number;
}
