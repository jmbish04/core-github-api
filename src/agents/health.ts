
import { Bindings } from '../utils/hono';
import { HealthResult } from '../health/types';
import { v4 as uuidv4 } from 'uuid';

export async function checkAIHealth(env: Bindings, runId: string): Promise<HealthResult[]> {
    const agents = [
        { name: 'Orchestrator', binding: env.ORCHESTRATOR },
        { name: 'Gemini Agent', binding: env.GEMINI_AGENT },
        { name: 'Planner', binding: env.PLANNER },
        { name: 'Supervisor', binding: env.SUPERVISOR },
        { name: 'Deep Reasoning', binding: env.DEEP_REASONING_AGENT }
    ];

    const results: HealthResult[] = [];

    for (const agent of agents) {
        const start = Date.now();
        try {
            const id = agent.binding.idFromName('health-check-probe');
            const stub = agent.binding.get(id);

            const res = await stub.fetch('http://internal/health-probe');

            results.push({
                id: uuidv4(),
                run_id: runId,
                category: 'ai',
                name: `${agent.name} Accessibility`,
                status: res.status < 500 ? 'success' : 'failure',
                message: res.status < 500 ? `Responsive (${res.status})` : `Error: ${res.status}`,
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
