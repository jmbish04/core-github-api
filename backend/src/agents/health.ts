
;
import { HealthResult } from '../health/types';
import { v4 as uuidv4 } from 'uuid';
import { getAgentByName } from 'agents';

export async function checkAIHealth(env: Env, runId: string): Promise<HealthResult[]> {
    const agents = [
        { name: 'Orchestrator', binding: env.ORCHESTRATOR, instance: 'health-check-probe' },
        { name: 'Gemini Agent', binding: env.GEMINI_AGENT, instance: 'health-check-probe' },
        { name: 'Planner', binding: env.PLANNER, instance: 'health-check-probe' },
        { name: 'Supervisor', binding: env.SUPERVISOR, instance: 'health-check-probe' },
        { name: 'Deep Reasoning', binding: env.DEEP_REASONING_AGENT, instance: 'health-check-probe' }
    ];

    const results: HealthResult[] = [];

    for (const agent of agents) {
        const start = Date.now();
        try {
            const getByName = getAgentByName as any;
            const stub = await getByName(agent.binding, agent.instance);
            let message = 'Healthy';

            if (typeof stub.healthProbe === 'function') {
                const probe = await stub.healthProbe();
                const probeStatus = probe?.status || 'ok';
                message = `Healthy (${probeStatus})`;
            } else {
                // Backward compatibility for agents without callable health probes.
                const res = await stub.fetch('http://agent/health-probe');
                if (!(res.status >= 200 && res.status < 300)) {
                    throw new Error(`Unhealthy HTTP status (${res.status})`);
                }
                message = `Healthy (${res.status})`;
            }

            results.push({
                id: uuidv4(),
                run_id: runId,
                category: 'ai',
                name: `${agent.name} Accessibility`,
                status: 'success',
                message,
                duration_ms: Date.now() - start,
                timestamp: new Date().toISOString()
            });
        } catch (e: any) {
            results.push({
                id: uuidv4(),
                run_id: runId,
                category: 'ai',
                name: `${agent.name} Accessibility`,
                status: 'failure',
                message: e.message,
                duration_ms: Date.now() - start,
                timestamp: new Date().toISOString()
            });
        }
    }

    return results;
}
