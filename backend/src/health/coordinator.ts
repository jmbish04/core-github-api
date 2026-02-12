
;
import { getDb } from '../db';
import { healthRuns, healthResults } from '../db/schema-health';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import { HealthResult } from './types';

// Import distributed checks
import { checkGitHubHealth } from '../workflows/health';
import { checkAIHealth } from '../agents/health';
import { checkAPIHealth } from '../api/health';

export class HealthCoordinator {
    private env: Env;
    private db: ReturnType<typeof getDb>;

    constructor(env: Env) {
        this.env = env;
        this.db = getDb(env.DB);
    }

    /**
     * Run all system health checks and persist results
     */
    async runAllChecks(trigger: 'manual' | 'scheduled' | 'api' = 'manual') {
        const runId = uuidv4();
        const start = Date.now();
        let runRecordCreated = false;

        const results: HealthResult[] = [];

        try {
            // 1. Create Run Record (Pending)
            await this.db.insert(healthRuns).values({
                id: runId,
                status: 'unknown',
                trigger,
                created_at: new Date().toISOString()
            });
            runRecordCreated = true;

            // 2. Run Checks Parallel
            const [github, ai, api] = await Promise.all([
                checkGitHubHealth(this.env, runId),
                checkAIHealth(this.env, runId),
                checkAPIHealth(this.env, runId)
            ]);

            results.push(...github, ...ai, ...api);

            // 3. Determine Overall Status
            const failure = results.find(r => r.status === 'failure');
            const overallStatus = failure ? 'unhealthy' : 'healthy';

            // 4. Update Run Record
            await this.db.update(healthRuns)
                .set({
                    status: overallStatus,
                    duration_ms: Date.now() - start
                })
                .where(eq(healthRuns.id, runId));

            // 5. Bulk Insert Results
            if (results.length > 0) {
                // Ensure type compatibility with DB schema (may strip extra fields if strictly typed)
                await this.db.insert(healthResults).values(results as any);
            }

            return {
                runId,
                status: overallStatus,
                results
            };

        } catch (e: any) {
            console.error('Critical Health Coordinator Failure', e);

            if (runRecordCreated) {
                try {
                    await this.db.update(healthRuns)
                        .set({ status: 'unhealthy', duration_ms: Date.now() - start })
                        .where(eq(healthRuns.id, runId));
                } catch (updateError) {
                    console.error('Failed to persist unhealthy health run state', updateError);
                }
            }

            return {
                runId,
                status: 'unhealthy' as const,
                results: [{
                    id: uuidv4(),
                    run_id: runId,
                    category: 'api',
                    name: 'Health Coordinator',
                    status: 'failure',
                    message: e.message || 'Health coordinator failed',
                    duration_ms: Date.now() - start,
                    timestamp: new Date().toISOString()
                }]
            };
        }
    }

    async getLatestRun() {
        try {
            const lastRun = await this.db.select().from(healthRuns)
                .orderBy(desc(healthRuns.created_at))
                .limit(1);

            if (!lastRun.length) return null;

            const results = await this.db.select().from(healthResults)
                .where(eq(healthResults.run_id, lastRun[0].id));

            return {
                run: lastRun[0],
                results
            };
        } catch (e) {
            console.error('Failed to read latest health run', e);
            return null;
        }
    }
}
