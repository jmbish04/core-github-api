export type QueueBuildAnalysisPayload = {
  repoFullName: string;
  prNumber?: number;
  rawLogs: string;
  proposedPrompt: string;
  analysisId?: string; // If already persisted in jules_build_analysis
};

export type ApprovalResult = {
  success: boolean;
  approvalId: string;
  status: "approved" | "rejected";
  julesSessionId?: string;
};

// ── Fleet-Wide Types (v7) ──────────────────────────────────────────────

/** Canonical identifier for any worker in the fleet. */
export type WorkerTarget = {
  workerName: string;
  accountId?: string;
  repoOwner?: string;
  repoName?: string;
};

/** Description of a failure observed on a target worker. */
export type FleetHealthFailure = {
  type: 'health' | 'build' | 'runtime' | 'pattern';
  message: string;
  details?: any;
};

/** Input for the generalized fleet-wide diagnose method. */
export type FleetDiagnoseInput = {
  target: WorkerTarget;
  failure: FleetHealthFailure;
  source: 'probe' | 'build' | 'runtime' | 'chat-correction';
  context?: {
    chatThreadId?: string;
    recurrenceCount?: number;
  };
};

/** Input for ingesting repeated user corrections from peer agents. */
export type ChatCorrectionInput = {
  target: WorkerTarget;
  correctionMessage: string;
  chatThreadId?: string;
  sourceAgent?: string;
};

/** Filter for querying fleet observations. */
export type FleetObservationFilter = {
  workerName?: string;
  source?: string;
  hitlPromoted?: boolean;
  limit?: number;
  offset?: number;
};

/** Where approved HITL proposals should be routed. */
export type ProposalTarget = 'template-repo' | 'guardrail-rules' | 'core-github-api' | 'worker-specific';

