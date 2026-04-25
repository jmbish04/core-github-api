/**
 * @file ai/providers/agent-support/health/types.ts
 * @description Diagnostic-grade health check types for the agentic backend.
 *
 * Three-layer model:
 *   Layer 1 — Probe Mechanics (HealthReport shape + parallel runner)
 *   Layer 2 — Base Class Checks (inherited from Base*Agent)
 *   Layer 3 — Per-Agent specialized checks (agentHealthChecks override)
 *
 * Fast mode: cron-driven, ≤2s per agent, zero Workers AI tokens.
 * Deep mode: user-triggered, ≤30s per agent, includes model round-trip.
 */

// ─── Core Enums ──────────────────────────────────────────────────────────
import type { ObservabilityEvent } from '../observability';

/** Probe execution mode. Fast = cron-safe; Deep = user-triggered only. */
export type HealthMode = 'fast' | 'deep';

/** Overall agent health status derived from check aggregation. */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Individual check outcome. */
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn';

/** Check classification for UI grouping and filtering. */
export type CheckCategory =
  | 'binding'    // Env binding presence
  | 'storage'    // DO SQLite / D1 round-trips
  | 'skill'      // SkillManager / D1 reachability
  | 'memory'     // Edigraph service connectivity
  | 'collab'     // Peer agent binding resolution
  | 'tool'       // MCP tools, external APIs
  | 'model'      // Workers AI inference (deep only)
  | 'chat'       // AIChatAgent internals
  | 'hitl'       // HITL queue D1 dry-run
  | 'custom';    // Per-agent domain checks

// ─── HealthCheck (individual probe result) ───────────────────────────────

/**
 * A single diagnostic check result.
 *
 * Naming convention for `name`:
 *   `{layer}.{subsystem}.{operation}`
 *   e.g. "base.d1.stateStoreRoundTrip", "agent.cf.apiTokenVerify"
 */
export interface HealthCheck {
  /** Hierarchical check name, e.g. "base.binding.DB" */
  name: string;

  /** Which architectural layer produced this check. */
  layer: 1 | 2 | 3;

  /** Semantic category for UI grouping. */
  category: CheckCategory;

  /** Outcome of this check. */
  status: CheckStatus;

  /** Wall-clock execution time in milliseconds. */
  durationMs: number;

  /** One-line human summary (always present for UI). */
  message: string;

  /** Error message or stack trace (only on failure). */
  error?: string;

  /** Arbitrary structured details for debugging. */
  details?: Record<string, unknown>;
}

// ─── HealthReport (per-agent aggregate) ──────────────────────────────────

/**
 * Complete health report returned by `healthProbe()` on every agent.
 * Designed for direct JSON serialization to the frontend.
 */
export interface HealthReport {
  /** Agent class name, e.g. "CloudflareAgent". */
  agent: string;

  /** Aggregate status derived from individual check outcomes. */
  status: HealthStatus;

  /** Mode the probe was executed in. */
  mode: HealthMode;

  /** Total wall-clock probe duration in milliseconds. */
  durationMs: number;

  /** ISO8601 timestamp when the probe completed. */
  timestamp: string;

  /** All individual check results. */
  checks: HealthCheck[];

  /** Quick summary counts for UI badges. */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };

  /** Optional ring buffer snapshot from V8 observability metrics */
  recentRpcErrors?: ObservabilityEvent[];
  recentMcpEvents?: ObservabilityEvent[];
}

// ─── Check Factory Type ──────────────────────────────────────────────────

/**
 * A check factory is a zero-arg async function that produces a HealthCheck.
 * The runner wraps each factory in Promise.race with a per-check timeout.
 */
export type HealthCheckFn = () => Promise<HealthCheck>;

// ─── Peer Binding Descriptor ─────────────────────────────────────────────

/**
 * Describes a peer agent binding that should be verified during health probes.
 * Used by base classes to iterate `peerAgentBindings` from subclasses.
 */
export interface PeerBindingDescriptor {
  /** The Env key for the Durable Object namespace, e.g. "GITHUB_AGENT". */
  bindingKey: string;

  /** If true, a missing/unresolvable binding → fail; if false → skip. */
  required: boolean;
}
