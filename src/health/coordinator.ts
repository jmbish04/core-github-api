
import { Bindings } from '../utils/hono';
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
    private env: Bindings;
    private db: ReturnType<typeof getDb>;

    constructor(env: Bindings) {
        this.env = env;
        this.db = getDb(env.DB);
    }

    /**
     * Run all system health checks and persist results
     */
    async runAllChecks(trigger: 'manual' | 'scheduled' | 'api' = 'manual') {
        const runId = uuidv4();
        const start = Date.now();

        // 1. Create Run Record (Pending)
        await this.db.insert(healthRuns).values({
            id: runId,
            status: 'unknown',
            trigger,
            created_at: new Date().toISOString()
        });

        const results: HealthResult[] = [];

        try {
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
            await this.db.update(healthRuns)
                .set({ status: 'unhealthy', duration_ms: Date.now() - start })
                .where(eq(healthRuns.id, runId));
            throw e;
        }
    }

    async getLatestRun() {
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
    }
}
