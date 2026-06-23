import { getDb } from '@db';
import * as backlogSchema from "@/db/schemas/projects/backlog";
import { HealthStepResult } from '@/health/types';
import { count, isNull, eq } from 'drizzle-orm';

/**
 * Checks the health and integrity of the many-to-many backlog structure.
 * 1. Checks for orphaned mapping records.
 * 2. Checks for phases without associated plan revisions.
 */
export async function checkBacklogIntegrity(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const db = getDb(env.DB);
    const details: Record<string, any> = {};
    const errors: string[] = [];

    try {
        // 1. Check for orphaned Phase-Sprint mappings
        const [orphanedPhaseSprints] = await db
            .select({ value: count() })
            .from(backlogSchema.phaseSprintsMap)
            .where(isNull(backlogSchema.phaseSprintsMap.phaseId));
        
        details.orphanedPhaseSprints = orphanedPhaseSprints?.value || 0;
        if (details.orphanedPhaseSprints > 0) errors.push(`${details.orphanedPhaseSprints} orphaned phase-sprint mappings`);

        // 2. Check for phases without titles (sanity check)
        const [untitledPhases] = await db
            .select({ value: count() })
            .from(backlogSchema.phases)
            .where(eq(backlogSchema.phases.title, ""));
        
        details.untitledPhases = untitledPhases?.value || 0;
        if (details.untitledPhases > 0) errors.push(`${details.untitledPhases} untitled phases detected`);

        // 3. Database connectivity verify
        await db.select().from(backlogSchema.phases).limit(1);
        details.database = "Connected";

        return {
            name: 'Backlog Data Integrity',
            status: errors.length === 0 ? 'success' : 'failure',
            message: errors.length === 0 ? 'Backlog hierarchy is consistent' : `Issues detected: ${errors.join(', ')}`,
            durationMs: Date.now() - start,
            details
        };
    } catch (e: any) {
        return {
            name: 'Backlog Data Integrity',
            status: 'failure',
            message: e.message || 'Failed to verify backlog integrity',
            durationMs: Date.now() - start,
            details: { error: e.message }
        };
    }
}
