/**
 * @file ai/providers/agent-support/health/runner.ts
 * @description Parallel health check runner with per-check timeout.
 *
 * Executes an array of HealthCheckFn in parallel, each wrapped in
 * Promise.race with a configurable timeout. A timed-out check produces
 * a synthetic `fail` HealthCheck — it never throws or blocks the suite.
 */

import type { HealthCheck, HealthCheckFn, HealthStatus } from './types';

// ─── Per-Check Timeout Defaults ──────────────────────────────────────────

/** Fast-mode per-check timeout (cron-driven, must be snappy). */
export const FAST_TIMEOUT_MS = 1_500;

/** Deep-mode per-check timeout (user-triggered, more generous). */
export const DEEP_TIMEOUT_MS = 10_000;

// ─── Runner ──────────────────────────────────────────────────────────────

interface RunChecksOptions {
  /** Per-check timeout in milliseconds. */
  timeoutMs: number;
}

/**
 * Execute health check functions in parallel, each with an individual timeout.
 *
 * - A check that exceeds `timeoutMs` receives a synthetic `fail` result.
 * - A check that throws receives a `fail` result with the error captured.
 * - Checks that return normally are passed through unchanged.
 *
 * @returns All HealthCheck results (guaranteed same length as input).
 */
export async function runChecks(
  fns: HealthCheckFn[],
  opts: RunChecksOptions,
): Promise<HealthCheck[]> {
  if (fns.length === 0) return [];

  const wrapped = fns.map(fn => runSingle(fn, opts.timeoutMs));
  return Promise.all(wrapped);
}

/**
 * Derive aggregate HealthStatus from a set of check results.
 *
 * - All pass/skip → healthy
 * - Any fail but not all required fail → degraded
 * - All checks failed → unhealthy
 */
export function aggregateStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.length === 0) return 'healthy';

  const failed = checks.filter(c => c.status === 'fail').length;
  const total = checks.length;

  if (failed === 0) return 'healthy';
  if (failed === total) return 'unhealthy';
  return 'degraded';
}

/**
 * Build the summary counts object for a HealthReport.
 */
export function buildSummary(checks: HealthCheck[]): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const c of checks) {
    if (c.status === 'pass') passed++;
    else if (c.status === 'fail') failed++;
    else skipped++;
  }

  return { total: checks.length, passed, failed, skipped };
}

// ─── Internal ────────────────────────────────────────────────────────────

async function runSingle(fn: HealthCheckFn, timeoutMs: number): Promise<HealthCheck> {
  const start = Date.now();

  try {
    const result = await Promise.race([
      fn(),
      timeoutSentinel(timeoutMs),
    ]);

    // Timeout sentinel returns a marker; real checks return HealthCheck
    if (isTimeoutMarker(result)) {
      return {
        name: 'unknown',
        layer: 1,
        category: 'custom',
        status: 'fail',
        durationMs: Date.now() - start,
        message: `Check timed out after ${timeoutMs}ms`,
        error: `Timeout exceeded: ${timeoutMs}ms`,
      };
    }

    return result;
  } catch (err: any) {
    return {
      name: 'unknown',
      layer: 1,
      category: 'custom',
      status: 'fail',
      durationMs: Date.now() - start,
      message: err.message || 'Check threw an exception',
      error: String(err),
    };
  }
}

// Sentinel pattern avoids reject() — Promise.race with a resolve of a
// known marker type lets us distinguish timeout from real results.
const TIMEOUT_MARKER = Symbol('health-check-timeout');
type TimeoutMarker = typeof TIMEOUT_MARKER;

function timeoutSentinel(ms: number): Promise<TimeoutMarker> {
  return new Promise(resolve => setTimeout(() => resolve(TIMEOUT_MARKER), ms));
}

function isTimeoutMarker(value: unknown): value is TimeoutMarker {
  return value === TIMEOUT_MARKER;
}
