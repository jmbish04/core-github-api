/**
 * @file workflows/planning/health.ts
 * @description Health check for Planning Orchestration dependencies.
 *
 * Validates:
 * 1. D1 database: planning_requests table accessible
 * 2. PLANNING_ORCHESTRATOR: Workflow binding reachable (binding presence only)
 * 3. PLANNER: Agents SDK agent — use getAgentByName from 'agents' package
 * 4. PLAN_ARTIFACTS: R2 bucket accessible
 * 5. PLAN_EMBEDDINGS: Vectorize index accessible
 *
 * NOTE on PLANNING_MONITOR:
 *   The PLANNING_MONITOR check was previously using raw DO `idFromName` + `get` + `fetch`
 *   which fails if no dedicated health endpoint exists on the DO.
 *   Replaced with a binding-presence check only.
 *
 * NOTE on PLANNING_ORCHESTRATOR (Workflow):
 *   Cloudflare Workflows API: `binding.create({ params })` creates an instance;
 *   `binding.get(instanceId)` fetches an existing instance by UUID.
 *   There is NO `.get("name")` by name. The health check now only verifies
 *   the binding is present — starting a real instance just to probe would be wasteful.
 */

import { getAgentByName } from 'agents';
import { HealthStepResult } from '@/health/types';
import { getDb, projectPlanningRequests } from '@db';
import { count } from 'drizzle-orm';

function getVectorizeDimensions(info: { dimensions?: number; config?: Record<string, unknown> }) {
  const config = info.config || {};
  return info.dimensions ?? (typeof config.dimensions === 'number' ? config.dimensions : undefined);
}

function getVectorizeMetric(info: { metric?: string; config?: Record<string, unknown> }) {
  const config = info.config || {};
  return info.metric ?? (typeof config.metric === 'string' ? config.metric : undefined);
}

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  const runCheck = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = { status: 'OK', latency: Date.now() - checkStart, ...result };
    } catch (error) {
      subChecks[name] = {
        status: 'FAILURE',
        latency: Date.now() - checkStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // 1. D1 database: verify planning_requests table is accessible
  await runCheck('database', async () => {
    const db = getDb(env.DB);
    const [result] = await db.select({ value: count() }).from(projectPlanningRequests);
    return {
      message: 'planning_requests schema accessible',
      rowCount: result?.value || 0,
    };
  });

  // 2. PLANNING_ORCHESTRATOR: Workflow binding presence only.
  //    Cloudflare Workflows does not support `.get(name)` — use `.create()` for
  //    a real invocation or just verify the binding is configured.
  await runCheck('workflow', async () => {
    if (!env.PLANNING_ORCHESTRATOR) {
      throw new Error('PLANNING_ORCHESTRATOR binding missing');
    }
    // Binding is present — the workflow class is registered.
    // We do NOT create an instance as that would trigger real execution.
    return {
      message: 'Planning workflow binding present',
      note: 'Binding presence confirmed; runtime test skipped to avoid spurious executions',
    };
  });

  // 3. PLANNING_MONITOR: Binding presence only (was incorrectly using raw DO methods).
  //    If a future dedicated /internal/health endpoint is added to the DO, this
  //    should be updated to do an actual fetch.
  await runCheck('monitor', async () => {
    if (!env.PLANNING_MONITOR) {
      throw new Error('PLANNING_MONITOR binding missing');
    }
    return {
      message: 'Planning monitor binding present',
      note: 'Binding presence confirmed; skipping DO fetch (no health endpoint defined)',
    };
  });

  // 4. PLAN_ARTIFACTS: R2 bucket accessible
  await runCheck('artifacts', async () => {
    if (!env.PLAN_ARTIFACTS) {
      throw new Error('PLAN_ARTIFACTS binding missing');
    }
    const listing = await env.PLAN_ARTIFACTS.list({ prefix: 'planning/', limit: 1 });
    return {
      message: 'Planning artifacts bucket accessible',
      previewCount: listing.objects.length,
      truncated: listing.truncated,
    };
  });

  // 5. PLAN_EMBEDDINGS: Vectorize index accessible
  await runCheck('embeddings', async () => {
    if (!env.PLAN_EMBEDDINGS) {
      throw new Error('PLAN_EMBEDDINGS binding missing');
    }
    const info = await env.PLAN_EMBEDDINGS.describe();
    return {
      message: 'Planning embeddings index accessible',
      dimensions: getVectorizeDimensions(info),
      metric: getVectorizeMetric(info),
    };
  });

  // 6. PLANNER: Agents SDK agent — use getAgentByName from 'agents' package.
  //    Do NOT use raw `idFromName` + `get`. The Agents SDK `getAgentByName`
  //    is the correct API for server-side agent access.
  await runCheck('planner', async () => {
    if (!env.PLANNER) {
      throw new Error('PLANNER binding missing');
    }
    // getAgentByName from 'agents' SDK — verifies binding + class registration.
    const plannerNs: any = env.PLANNER;
    const stub = await getAgentByName(plannerNs, 'planning-health-probe');
    if (!stub) throw new Error('getAgentByName returned null — PLANNER may be misconfigured');
    return {
      message: 'Planner agent stub resolved via Agents SDK',
      note: 'HTTP probe skipped — agent health endpoint not guaranteed to be mounted',
    };
  });

  const hasFailure = Object.values(subChecks).some(
    (check: any) => check.status === 'FAILURE',
  );

  return {
    name: 'Planning Orchestration',
    status: hasFailure ? 'failure' : 'success',
    message: hasFailure
      ? 'One or more planning dependencies failed'
      : 'All planning dependencies healthy',
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
