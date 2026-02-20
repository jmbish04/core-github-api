
import { getDb } from '../db';
import { healthRuns, healthResults, healthTestDefinitions } from '../db/schemas/logs/health';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, gt } from 'drizzle-orm';
import { HealthResult, HealthCategory, HealthStepResult } from './types';
import { analyzeFailure } from '../ai/utils/diagnostician';

// ─── Import ALL distributed modular checks ──────────────────────────────
import { checkGitHubHealth } from '../workflows/health';
import { checkHealth as checkAIHealth } from '../ai/health';
import { checkHealth as checkAgentsHealth } from '../ai/agents/health';
import { checkHealth as checkMCPHealth } from '../ai/mcp/health';
import { checkHealth as checkBrowserHealth } from '../ai/agents/tools/browser/health';
import { checkHealth as checkGitSandboxHealth } from '../ai/agents/tools/git/health';
import { checkAPIHealth } from '../api/health';

// ─── Check Registry ──────────────────────────────────────────────────────
// Each check returns HealthStepResult and maps to a category for D1 persistence.
interface RegisteredCheck {
    id: string;
    category: HealthCategory;
    fn: (env: Env) => Promise<HealthStepResult>;
}

const CODE_CHECKS: RegisteredCheck[] = [
    { id: 'db',       category: 'api',     fn: checkAPIHealth },
    { id: 'ai',       category: 'ai',      fn: checkAIHealth },
    { id: 'agents',   category: 'agents',  fn: checkAgentsHealth },
    { id: 'mcp',      category: 'mcp',     fn: checkMCPHealth },
    { id: 'github',   category: 'github',  fn: checkGitHubHealth },
    { id: 'browser',  category: 'browser', fn: checkBrowserHealth },
    { id: 'git',      category: 'git',     fn: checkGitSandboxHealth },
];

export class HealthCoordinator {
    private env: Env;
    private db: ReturnType<typeof getDb>;

    constructor(env: Env) {
        this.env = env;
        this.db = getDb(env.DB);
    }

    /**
     * Run all system health checks (code-based + dynamic) and persist results.
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

            // 2. Run ALL Code Checks in Parallel
            const checkPromises = CODE_CHECKS.map(async (check) => {
                try {
                    return { check, result: await check.fn(this.env) };
                } catch (e: any) {
                    return {
                        check,
                        result: {
                            name: check.id,
                            status: 'failure' as const,
                            message: e.message || 'Check threw an exception',
                            durationMs: 0,
                            details: undefined,
                            analysis: undefined,
                        } as HealthStepResult
                    };
                }
            });

            const settledChecks = await Promise.all(checkPromises);

            // 3. Run Dynamic DB-Driven Tests
            const dynamicResults = await this.runDynamicTests(runId);

            // 4. Map results + AI analysis for failures
            const now = new Date().toISOString();

            for (const { check, result } of settledChecks) {
                let aiSuggestion: string | null = null;

                // Generate AI remediation for failures
                if (result.status === 'failure' && this.env.AI) {
                    try {
                        const analysis = await analyzeFailure(
                            this.env,
                            result.name,
                            result.message || 'Unknown failure',
                            result.details
                        );
                        if (analysis) {
                            aiSuggestion = `[${analysis.severity}] ${analysis.rootCause} — Fix: ${analysis.suggestedFix}`;
                            result.analysis = analysis;
                        }
                    } catch {
                        // AI analysis is best-effort, don't block
                    }
                }

                results.push({
                    id: uuidv4(),
                    run_id: runId,
                    category: check.category,
                    name: result.name,
                    status: result.status === 'warning' || result.status === 'SKIPPED'
                        ? 'success'
                        : (result.status as 'success' | 'failure'),
                    message: result.message,
                    duration_ms: result.durationMs,
                    details: result.details,
                    ai_suggestion: aiSuggestion,
                    timestamp: now
                });
            }

            // Add dynamic test results
            results.push(...dynamicResults);

            // 5. Determine Overall Status
            const failureCount = results.filter(r => r.status === 'failure').length;
            const overallStatus = failureCount === 0
                ? 'healthy'
                : failureCount < results.length
                    ? 'degraded'
                    : 'unhealthy';

            console.log(`[HealthCoordinator] Run ${runId}: ${results.length} checks, ${failureCount} failures → ${overallStatus}`);

            // 6. Update Run Record
            const fullSteps = settledChecks.map(s => s.result);
            await this.db.update(healthRuns)
                .set({
                    status: overallStatus,
                    duration_ms: Date.now() - start,
                    metadata: { steps: fullSteps }
                })
                .where(eq(healthRuns.id, runId));

            // 7. Bulk Insert Results
            if (results.length > 0) {
                await this.db.insert(healthResults).values(results);
            }

            return { runId, status: overallStatus, results };

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
                    category: 'api' as const,
                    name: 'Health Coordinator',
                    status: 'failure' as const,
                    message: e.message || 'Health coordinator failed',
                    duration_ms: Date.now() - start,
                    timestamp: new Date().toISOString()
                }]
            };
        }
    }

    /**
     * Execute dynamic tests from healthTestDefinitions table.
     */
    private async runDynamicTests(runId: string): Promise<HealthResult[]> {
        const results: HealthResult[] = [];

        try {
            const definitions = await this.db.select()
                .from(healthTestDefinitions)
                .where(eq(healthTestDefinitions.enabled, true));

            if (!definitions.length) return results;

            for (const def of definitions) {
                const start = Date.now();
                try {
                    const response = await fetch(def.target, {
                        method: def.method || 'GET',
                        signal: AbortSignal.timeout(10_000),
                    });

                    const isExpected = response.status === (def.expected_status || 200);

                    results.push({
                        id: uuidv4(),
                        run_id: runId,
                        category: 'api',
                        name: `[Dynamic] ${def.name}`,
                        status: isExpected ? 'success' : 'failure',
                        message: isExpected
                            ? `${response.status} OK`
                            : `Expected ${def.expected_status}, got ${response.status}`,
                        duration_ms: Date.now() - start,
                        details: { criticality: def.criticality, target: def.target },
                        timestamp: new Date().toISOString()
                    });
                } catch (e: any) {
                    results.push({
                        id: uuidv4(),
                        run_id: runId,
                        category: 'api',
                        name: `[Dynamic] ${def.name}`,
                        status: 'failure',
                        message: e.message || 'Request failed',
                        duration_ms: Date.now() - start,
                        details: { criticality: def.criticality, target: def.target },
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } catch (e) {
            console.error('[HealthCoordinator] Failed to load dynamic tests:', e);
        }

        return results;
    }

    /**
     * Get the latest health run with its detailed results.
     */
    async getLatestRun() {
        try {
            const lastRun = await this.db.select().from(healthRuns)
                .orderBy(desc(healthRuns.created_at))
                .limit(1);

            if (!lastRun.length) return null;

            const runResults = await this.db.select().from(healthResults)
                .where(eq(healthResults.run_id, lastRun[0].id));

            return {
                run: lastRun[0],
                results: runResults
            };
        } catch (e) {
            console.error('Failed to read latest health run', e);
            return null;
        }
    }

    /**
     * Get health run history with optional filters.
     */
    async getHistory(options: { limit?: number; onlyFailures?: boolean; since?: string }) {
        const { limit = 20, onlyFailures = false, since } = options;

        try {
            const conditions = [];
            if (onlyFailures) {
                conditions.push(eq(healthRuns.status, 'unhealthy'));
            }
            if (since) {
                conditions.push(gt(healthRuns.created_at, since));
            }

            const runs = await this.db.select().from(healthRuns)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(desc(healthRuns.created_at))
                .limit(limit);

            // Fetch results for each run
            const history = await Promise.all(runs.map(async (run) => {
                const runResults = await this.db.select().from(healthResults)
                    .where(eq(healthResults.run_id, run.id));
                return { run, results: runResults };
            }));

            return history;
        } catch (e) {
            console.error('Failed to read health history', e);
            return [];
        }
    }
}
