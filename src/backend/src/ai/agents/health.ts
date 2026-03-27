/**
 * @file ai/agents/health.ts
 * @description Health check for the Agents Ecosystem.
 *
 * Uses the official `getAgentByName` from the `agents` SDK (not raw DO methods).
 * Honi agents are accessed via HTTP using the Honi handler URL pattern.
 */

import { getAgentByName } from 'agents';
import { HoniClient } from '@utils/honi-client';
import { HealthStepResult } from '@/health/types';

/**
 * Agents SDK agents: probe via getAgentByName from the `agents` package.
 * Just resolving the stub confirms the binding and class registration.
 */
const AGENTS_SDK_AGENTS = [
  { name: 'Orchestrator', bindingKey: 'ORCHESTRATOR' },
  { name: 'Gemini Agent', bindingKey: 'GEMINI_AGENT' },
  { name: 'Planner', bindingKey: 'PLANNER' },
  { name: 'Supervisor', bindingKey: 'SUPERVISOR' },
  { name: 'Deep Reasoning', bindingKey: 'DEEP_REASONING_AGENT' },
];

/**
 * Honi agents: accessed via the Honi HTTP handler.
 * The Honi SDK routes /chat, /history, /memory etc. through the DO handler.
 * We probe /memory (GET) which is a lightweight, no-AI-call endpoint.
 */
const HONI_AGENTS = [
  { name: 'Reverse Engineering Orchestrator', bindingKey: 'HONI_ORCHESTRATOR' },
  { name: 'Reverse Engineering Consultant', bindingKey: 'HONI_CONSULTANT' },
];

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const agentResults: Record<string, any> = {};
  let failureCount = 0;
  let skippedCount = 0;

  // ── Agents SDK: use official getAgentByName ──────────────────────────────
  for (const agent of AGENTS_SDK_AGENTS) {
    const binding = (env as any)[agent.bindingKey];
    if (!binding) {
      agentResults[agent.name] = { status: 'SKIPPED', reason: `${agent.bindingKey} binding missing` };
      skippedCount++;
      continue;
    }

    try {
      // getAgentByName from 'agents' package — correct SDK method.
      // Resolving the stub confirms binding configured + class registered.
      const stub = await getAgentByName(binding, 'health-check-probe');
      if (!stub) throw new Error('getAgentByName returned null — binding may be misconfigured');
      agentResults[agent.name] = { status: 'success', message: 'Binding resolved via Agents SDK' };
    } catch (e: any) {
      failureCount++;
      agentResults[agent.name] = {
        status: 'failure',
        message: e.message,
        error: String(e),
      };
    }
  }

  // ── Honi agents: probe via Honi HTTP handler ─────────────────────────────
  for (const agent of HONI_AGENTS) {
    const binding = (env as any)[agent.bindingKey];
    if (!binding) {
      agentResults[agent.name] = { status: 'SKIPPED', reason: `${agent.bindingKey} binding missing` };
      skippedCount++;
      continue;
    }

    try {
      // For Honi agents, the Honi SDK exposes a DO that handles HTTP.
      // We use the raw DO namespace to get a stub, then fetch /memory
      // which is the cheapest Honi endpoint (no AI call required).
      const response = await HoniClient.memory(binding, 'health-check-probe');

      if (response.status >= 500) {
        throw new Error(`Honi agent returned HTTP ${response.status}`);
      }
      // 404 is ok — it means the DO is alive but has no stored memory yet
      agentResults[agent.name] = {
        status: 'success',
        message: `Honi handler reachable (HTTP ${response.status})`,
      };
    } catch (e: any) {
      failureCount++;
      agentResults[agent.name] = {
        status: 'failure',
        message: e.message,
        error: String(e),
      };
    }
  }

  const totalAgents = AGENTS_SDK_AGENTS.length + HONI_AGENTS.length;
  const activeAgents = totalAgents - skippedCount;

  const overallStatus: 'success' | 'failure' | 'warning' =
    failureCount === 0 ? 'success' :
    failureCount === activeAgents ? 'failure' : 'warning';

  return {
    name: 'Agents Ecosystem',
    status: overallStatus,
    message: `Agents: ${activeAgents - failureCount}/${activeAgents} operational`,
    durationMs: Date.now() - start,
    details: agentResults,
  };
}
