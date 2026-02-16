
import { getDb } from '../db';
import { healthRuns } from '../db/schemas/logs/health';
import { HealthStepResult } from '../health/health-check';
import { v4 as uuidv4 } from 'uuid';

export async function checkAPIHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const db = getDb(env.DB);

    try {
        // D1 Connectivity Check
        await db.select().from(healthRuns).limit(1);
        return {
            name: 'Database (D1 Core)',
            status: 'success',
            message: 'Accessible',
            durationMs: Date.now() - start
        };
    } catch (e: any) {
        return {
            name: 'Database (D1 Core)',
            status: 'failure',
            message: e.message,
            durationMs: Date.now() - start,
            details: { error: e.message }
        };
    }
}
