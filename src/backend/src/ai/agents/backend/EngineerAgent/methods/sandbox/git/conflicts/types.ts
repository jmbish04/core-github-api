/**
 * @file EngineerAgent/methods/sandbox/git/conflicts/types.ts
 * @description Type definitions for the full git merge-conflict resolution pipeline.
 */



// ── Conflict Detection ────────────────────────────────────────────────────────

/** A single file that contains one or more merge conflict markers. */
export interface ConflictFile {
  path: string;
  /** Full file content including <<<<<<< / ======= / >>>>>>> markers. */
  rawConflict: string;
  /** The HEAD (ours) block extracted from the conflict. */
  ours: string;
  /** The MERGE_HEAD (theirs) block extracted from the conflict. */
  theirs: string;
}

// ── Conflict Resolution ───────────────────────────────────────────────────────

/** The resolved version of one conflicted file. */
export interface ConflictResolution {
  path: string;
  resolvedContent: string;
  strategy: "opencode" | "ai" | "ours" | "theirs";
  /** 0–1 AI-assigned confidence score. */
  confidence: number;
}

// ── Pipeline Options & Results ────────────────────────────────────────────────

export interface ResolveConflictsOptions {
  owner: string;
  repo: string;
  prNumber: number;
  /** The PR head branch (the one being merged in). */
  headBranch: string;
  /** The target base branch (main / master). */
  baseBranch: string;
  /** Stable sandbox session ID. Defaults to `colby-conflicts-<owner>-<repo>-<pr>`. */
  sessionId?: string;
  /** Operation ID forwarded to client via SSE timeline updates. */
  operationId?: string;
  /** If true, skip opencode and use the AI fallback directly. */
  skipOpencode?: boolean;
}

export interface ResolveConflictsResult {
  success: boolean;
  resolvedFiles: string[];
  failedFiles: string[];
  commitSha?: string;
  prUrl?: string;
  error?: string;
  /** Raw timeline entries emitted during the run for diagnostics. */
  timeline?: Array<{ step: string; status: string; details?: string }>;
}
