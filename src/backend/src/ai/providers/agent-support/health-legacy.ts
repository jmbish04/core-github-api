/**
 * @file ai/agents/health.ts
 * @description Health check for the Agents Ecosystem.
 *
 * Uses the official `getAgentByName` from the `agents` SDK (not raw DO methods).
 */

import { getAgentByName } from 'agents';
import { HealthStepResult } from '@/health/types';

/**
 * Agents SDK agents: probe via getAgentByName from the `agents` package.
 * Just resolving the stub confirms the binding and class registration.
 */
const AGENTS_SDK_AGENTS = [
  { name: 'Orchestrator', bindingKey: 'ORCHESTRATOR' },
  { name: 'Engineer', bindingKey: 'ENGINEER_AGENT' },
  { name: 'Guardrail', bindingKey: 'GUARDRAIL_AGENT' },
  { name: 'Research', bindingKey: 'RESEARCH_AGENT' },
  { name: 'GitHub', bindingKey: 'GITHUB_AGENT' },
  { name: 'Cloudflare', bindingKey: 'CLOUDFLARE_AGENT' },
  { name: 'Design', bindingKey: 'DESIGN_AGENT' },
  { name: 'Learning', bindingKey: 'LEARNING_AGENT' },
  { name: 'Workshop', bindingKey: 'WORKSHOP_AGENT' },
  { name: 'ChatRoom', bindingKey: 'CHAT_ROOM' },
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

  const activeAgents = AGENTS_SDK_AGENTS.length - skippedCount;

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
