
import { Bindings } from '../utils/hono';
import { getDb } from '../db';
import { healthRuns } from '../db/schema-health';
import { HealthResult } from '../health/types';
import { v4 as uuidv4 } from 'uuid';

export async function checkAPIHealth(env: Bindings, runId: string): Promise<HealthResult[]> {
    const start = Date.now();
    const results: HealthResult[] = [];
    const db = getDb(env.DB);

    try {
        // D1 Connectivity Check
        await db.select().from(healthRuns).limit(1);
        results.push({
            id: uuidv4(),
            run_id: runId,
            category: 'api',
            name: 'Database (D1 Core)',
            status: 'success',
            message: 'Accessible',
            duration_ms: Date.now() - start,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        results.push({
            id: uuidv4(),
            run_id: runId,
            category: 'api',
            name: 'Database (D1 Core)',
            status: 'failure',
            message: e.message,
            duration_ms: Date.now() - start,
            timestamp: new Date().toISOString()
        });
    }

    return results;
}
