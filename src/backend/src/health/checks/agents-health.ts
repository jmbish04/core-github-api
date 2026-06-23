/**
 * @file health/checks/agents-health.ts
 * @description Central health probe for all registered Agents SDK agents.
 *
 * Interaction pattern (per Cloudflare Agents SDK docs):
 *   1. Resolve the agent stub with `getAgentByName(binding, id)` from the 'agents' package.
 *   2. Call @callable RPC methods directly on the stub (ping, healthProbe) — no raw fetch.
 *
 * DO NOT use `idFromName` / `binding.get()` / `stub.fetch()` — those are raw Durable Object
 * primitives that bypass the SDK's RPC layer and authentication wrapper entirely.
 */

import { getAgentByName } from 'agents';
import { HealthStepResult } from '../types';

const agentsList = [
    { name: 'OrchestratorAgent', key: 'ORCHESTRATOR_AGENT' },
    { name: 'CoordinatorAgent', key: 'COORDINATOR_AGENT' },
    { name: 'EngineerAgent', key: 'ENGINEER_AGENT' },
    { name: 'GuardrailAgent', key: 'GUARDRAIL_AGENT' },
    { name: 'ResearchAgent', key: 'RESEARCH_AGENT' },
    { name: 'GithubAgent', key: 'GITHUB_AGENT' },
    { name: 'CloudflareAgent', key: 'CLOUDFLARE_AGENT' },
    { name: 'DesignAgent', key: 'DESIGN_AGENT' },
    { name: 'LearningAgent', key: 'LEARNING_AGENT' },
    { name: 'WorkshopAgent', key: 'WORKSHOP_AGENT' },
];

export function getRegisteredAgentNames() {
    return agentsList.map(a => a.name);
}

/**
 * Deep probe for a single named agent.
 * Uses the Agents SDK `getAgentByName` to obtain the RPC stub, then calls
 * the `healthProbe({ mode: 'deep' })` @callable method directly.
 */
export async function probeAgentDeep(env: Env, agentName: string) {
    const agentDef = agentsList.find(a => a.name === agentName);
    if (!agentDef) return { agentName, error: 'Agent not found' };

    const binding = (env as any)[agentDef.key];
    if (!binding) return { agentName, error: 'Binding missing' };

    try {
        // ✅ Agents SDK: resolve via getAgentByName, not raw idFromName/get
        const stub = await getAgentByName(binding, 'health-probe') as any;
        if (!stub) throw new Error('getAgentByName returned null — binding may be misconfigured');

        // ✅ Call the @callable RPC method directly — no manual HTTP request
        const report = await stub.healthProbe({ mode: 'deep' });
        return { agentName, report };
    } catch (error: any) {
        return { agentName, error: error.message };
    }
}

/**
 * Fleet-wide agent health check.
 * Probes all registered agents in parallel using the Agents SDK pattern:
 *   - `ping()` for a fast liveness check     → @callable on BaseAgent
 *   - `healthProbe({ mode: 'fast' })`         → @callable on BaseAgent (Layer 2 + 3 checks)
 */
export async function checkAgentsHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    let healthyCount = 0;
    let degradedCount = 0;
    let unreachableCount = 0;
    const details: Record<string, any> = {};

    await Promise.all(agentsList.map(async (agentDef) => {
        const binding = (env as any)[agentDef.key];
        if (!binding) {
            unreachableCount++;
            details[agentDef.name] = { status: 'unreachable', error: `Binding ${agentDef.key} missing from Env` };
            return;
        }

        try {
            // ✅ Agents SDK: use getAgentByName — handles Durable Object routing + auth internally
            const stub = await getAgentByName(binding, 'health-probe') as any;
            if (!stub) throw new Error('getAgentByName returned null — binding may be misconfigured');

            // ✅ Call @callable ping() RPC for fast liveness check
            await stub.ping();

            // ✅ Call @callable healthProbe() RPC for layered diagnostic report
            const healthData = await stub.healthProbe({ mode: 'fast' });

            if (healthData.status === 'ok' || healthData.status === 'healthy' || healthData.status === 'success') {
                healthyCount++;
            } else {
                degradedCount++;
            }
            details[agentDef.name] = healthData;
        } catch (error: any) {
            unreachableCount++;
            details[agentDef.name] = { status: 'failure', error: error.message };
        }
    }));

    const status = (unreachableCount > 0 || degradedCount > 0) ? 'failure' : 'success';

    return {
        name: 'agents_detailed',
        status,
        message: `Agent health: ${healthyCount}/${agentsList.length} healthy, ${degradedCount} degraded, ${unreachableCount} unreachable`,
        durationMs: Date.now() - start,
        details: { agents: details },
    };
}
