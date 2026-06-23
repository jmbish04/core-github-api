/**
 * @file ai/providers/agent-support/health/index.ts
 * @description Barrel re-export for the v6 layered health system.
 */

// Types
export type {
  HealthMode,
  HealthStatus,
  CheckStatus,
  CheckCategory,
  HealthCheck,
  HealthReport,
  HealthCheckFn,
  PeerBindingDescriptor,
} from './types';

// Runner
export {
  runChecks,
  aggregateStatus,
  buildSummary,
  FAST_TIMEOUT_MS,
  DEEP_TIMEOUT_MS,
} from './runner';

// Base check factories (B1–B7)
export {
  checkBindingSanity,
  checkAIProviderInit,
  checkStateStoreRoundTrip,
  checkSkillManagerReachability,
  checkEdigraphConnectivity,
  checkHitlQueueDryRun,
  checkCollabBindingResolution,
} from './base-checks';

// Chat check factories (C1–C3)
export {
  checkAIChatAgentInternals,
  checkStreamShapeSanity,
  checkWorkersAIChatRoundTrip,
  getChatChecks,
} from './chat-checks';
