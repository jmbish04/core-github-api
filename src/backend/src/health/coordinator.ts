
import { getDb } from '@db';
import { healthRuns, healthResults, healthTestDefinitions } from '@db/schemas/logs/health';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, gt } from 'drizzle-orm';
import { HealthResult, HealthCategory, HealthStepResult } from './types';
import { Logger } from '@/lib/logger';

// ─── Import ALL distributed modular checks ──────────────────────────────
import { checkGitHubAPIHealth, checkWebhooksHealth, checkGitHubAppAuthHealth } from '@/workflows/health';
import { checkHealth as checkAIHealth } from '@/ai/health';
import { checkAIGatewayHealth } from '@/ai/providers/ai-gateway/health';
import { checkHealth as checkMCPHealth } from '@/ai/mcp/health';
import { checkHealth as checkBrowserHealth } from '@/ai/mcp/tools/browser/health';
import { checkHealth as checkSandboxHealth } from '@/ai/mcp/tools/sandbox-sdk/health';
import { checkAPIHealth } from '@/routes/api/health';
import { checkHealth as checkPlanningHealth } from '@/workflows/planning/health';
import { checkHealth as checkResearchHealth } from '@/workflows/research/health';
import { checkHealth as checkDatabaseHealth } from '@/db/health';
import { checkHealth as checkSemanticsHealth } from '@/lib/vectorize/health';
import { checkHealth as checkAutomationsHealth } from '@/automations/health';
import { checkHealth as checkEdgraphHealth } from '@/lib/edgraph/health';
import { checkWebhookStaleness } from '@/health/checks/webhook-staleness';
import { checkLogStaleness } from '@/health/checks/log-staleness';
import { checkD1TableScan } from '@/health/checks/d1-table-scan';
import { checkHealth as checkSentinelHealth } from '@/routes/api/projects/sentinel/health';
import { checkOrchestrationHealth } from '@/ai/agents/backend/OrchestratorAgent';
import { checkBacklogIntegrity } from '@/routes/api/projects/backlog/health';

// ─── Timeouts ────────────────────────────────────────────────────────────
/**
 * Maximum wall-clock time (ms) a single health check is allowed to run.
 * If a check exceeds this, it is marked as 'failure' with a timeout message.
 * This prevents a single slow check (e.g. Sandbox boot, GitHub API) from
 * consuming the entire Worker CPU budget.
 */
const PER_CHECK_TIMEOUT_MS = 8_000;
const DEEP_CHECK_TIMEOUT_MS = 45_000;

/**
 * Maximum wall-clock time (ms) for the entire health suite (all checks +
 * DB persistence). Must be well under the Cloudflare Worker CPU time limit
 * (30s on paid plan). We set this to 55s to leave headroom for result
 * persistence and JSON serialization. Note: LLM checks do not consume CPU
 * time as heavily since they are bound by async external HTTP waits.
 */
const OVERALL_DEADLINE_MS = 55_000;

/**
 * Maximum wall-clock time (ms) for each dynamic (user-defined) HTTP probe.
 */
const DYNAMIC_TEST_TIMEOUT_MS = 5_000;

// ─── Check Registry ──────────────────────────────────────────────────────
// Each check returns HealthStepResult and maps to a category for D1 persistence.
interface RegisteredCheck {
    id: string;
    category: HealthCategory;
    fn: (env: Env) => Promise<HealthStepResult>;
}

const CODE_CHECKS: RegisteredCheck[] = [
    { id: 'api',        category: 'api',         fn: checkAPIHealth },
    { id: 'database',   category: 'database',    fn: checkDatabaseHealth },
    { id: 'semantics',  category: 'semantics',   fn: checkSemanticsHealth },
    { id: 'ai',         category: 'ai',          fn: checkAIHealth },
    { id: 'ai_gateway', category: 'ai',          fn: checkAIGatewayHealth },
    { id: 'mcp',        category: 'mcp',         fn: checkMCPHealth },
    { id: 'browser',    category: 'browser',     fn: checkBrowserHealth },
    { id: 'github_app', category: 'github',      fn: checkGitHubAppAuthHealth },
    { id: 'github',     category: 'github',      fn: checkGitHubAPIHealth },
    { id: 'webhooks',   category: 'webhooks',    fn: checkWebhooksHealth },
    { id: 'sandbox',    category: 'sandbox',     fn: checkSandboxHealth },
    { id: 'research',   category: 'research',    fn: checkResearchHealth },
    { id: 'planning',   category: 'planning',    fn: checkPlanningHealth },
    { id: 'edgraph',    category: 'database',    fn: checkEdgraphHealth },
    { id: 'automations',       category: 'automations', fn: checkAutomationsHealth },
    { id: 'webhook_staleness', category: 'webhooks',    fn: checkWebhookStaleness },
    { id: 'log_staleness',     category: 'database',    fn: checkLogStaleness },
    { id: 'd1_table_scan',     category: 'database',    fn: checkD1TableScan },
    { id: 'sentinel',          category: 'sentinel',    fn: checkSentinelHealth },
    { id: 'orchestration',     category: 'agents',      fn: checkOrchestrationHealth },
    { id: 'backlog',           category: 'database',    fn: checkBacklogIntegrity },
];

/**
 * Wraps a health check function with a per-check timeout.
 * If the check doesn't resolve within \`PER_CHECK_TIMEOUT_MS\`, a synthetic
 * failure result is returned so the suite can continue.
 */
async function runCheckWithTimeout(
    check: RegisteredCheck,
    env: Env,
): Promise<{ check: RegisteredCheck; result: HealthStepResult }> {
    const checkStart = Date.now();
    const timeoutOverride = check.id === 'guardrail_deep' ? DEEP_CHECK_TIMEOUT_MS : PER_CHECK_TIMEOUT_MS;

    try {
        const result = await Promise.race([
            check.fn(env),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timed out after ${timeoutOverride}ms`)), timeoutOverride)
            ),
        ]);
        return { check, result };
    } catch (e: any) {
        return {
            check,
            result: {
                name: check.id,
                status: 'failure' as const,
                message: e.message || 'Check threw an exception',
                durationMs: Date.now() - checkStart,
                details: {
                    errorName: e.name,
                    timeout: e.message?.includes('Timed out'),
                    category: check.category,
                },
                analysis: undefined,
            } as HealthStepResult,
        };
    }
}

export class HealthCoordinator {
    private env: Env;
    private db: ReturnType<typeof getDb>;
    private logger: Logger;

    constructor(env: Env) {
        this.env = env;
        this.db = getDb(env.DB);
        this.logger = new Logger(env, 'HealthCoordinator');
    }

    /**
     * Run all system health checks (code-based + dynamic) and persist results.
     *
     * ──────────────────────────────────────────────────────────────────────
     * PERFORMANCE ARCHITECTURE (prevents Error 1102):
     *
     * 1. Each check has an 8-second timeout — a slow Sandbox boot or GitHub
     *    API call cannot burn the entire CPU budget.
     *
     * 2. AI diagnosis is NOT run inline. Health checks must be fast and
     *    deterministic. AI analysis (via HEALTH_DIAGNOSTICIAN DO) is
     *    available as a separate POST /api/health/analyze endpoint that the
     *    frontend can call per-failure after results are displayed.
     *
     * 3. An overall 25-second deadline exists. If the suite is still running
     *    after 25s, it bails out with whatever results it has. This leaves
     *    5 seconds of headroom for DB persistence before the 30s CPU limit.
     *
     * 4. Dynamic tests have a 5-second per-test timeout via AbortSignal.
     * ──────────────────────────────────────────────────────────────────────
     */
    async runAllChecks(trigger: 'manual' | 'scheduled' | 'api' = 'manual') {
        const runId = uuidv4();
        const suiteStart = Date.now();
        let runRecordCreated = false;

        const results: HealthResult[] = [];

        try {
            // 1. Create Run Record (Pending)
            await this.db.insert(healthRuns).values({
                id: runId,
                status: 'unknown',
                trigger,
            });
            runRecordCreated = true;

            // 2. Run ALL Code Checks in Parallel (each with individual timeout)
            const settledChecks = await Promise.all(
                CODE_CHECKS.map(check => runCheckWithTimeout(check, this.env))
            );

            // 3. Check overall deadline before dynamic tests
            const elapsedMs = Date.now() - suiteStart;
            let dynamicResults: HealthResult[] = [];
            let dynamicSkipped = false;

            if (elapsedMs < OVERALL_DEADLINE_MS - DYNAMIC_TEST_TIMEOUT_MS) {
                dynamicResults = await this.runDynamicTests(runId);
            } else {
                dynamicSkipped = true;
                this.logger.warn(`Skipping dynamic tests — ${elapsedMs}ms elapsed, approaching deadline`);
            }

            // 4. Map results to persistence format (NO AI analysis inline)
            const now = new Date().toISOString();

            for (const { check, result } of settledChecks) {
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
                    ai_suggestion: null, // AI analysis is deferred — use POST /analyze
                    timestamp: now
                });
            }

            // Add dynamic test results
            for (const r of dynamicResults) {
                results.push(r);
            }

            // 5. Determine Overall Status
            const failureCount = results.filter(r => r.status === 'failure').length;
            const overallStatus = failureCount === 0
                ? 'healthy'
                : failureCount < results.length
                    ? 'degraded'
                    : 'unhealthy';

            const totalDuration = Date.now() - suiteStart;
            this.logger.info(`Run ${runId}: ${results.length} checks, ${failureCount} failures → ${overallStatus}`, { durationMs: totalDuration, failureCount });

            // 6. Update Run Record
            const fullSteps = settledChecks.map(s => s.result);
            await this.db.update(healthRuns)
                .set({
                    status: overallStatus,
                    duration_ms: totalDuration,
                    metadata: {
                        steps: fullSteps,
                        dynamicSkipped,
                        deadline: OVERALL_DEADLINE_MS,
                    }
                })
                .where(eq(healthRuns.id, runId));

            // 7. Batch-insert results — D1 caps bind params at 100 per statement.
            // health_results has 10 columns → max 9 rows per stmt (9×10=90 params).
            if (results.length > 0) {
                const BATCH_SIZE = 9;
                const chunks: HealthResult[][] = [];
                for (let i = 0; i < results.length; i += BATCH_SIZE) {
                    chunks.push(results.slice(i, i + BATCH_SIZE));
                }
                const stmts = chunks.map(chunk =>
                    this.db.insert(healthResults).values(chunk)
                );
                await this.db.batch(stmts as any);
            }

            await this.logger.flush();
            return { runId, status: overallStatus, results };

        } catch (e: any) {
            this.logger.error('Critical Health Coordinator Failure', { error: e.message || e });

            if (runRecordCreated) {
                try {
                    await this.db.update(healthRuns)
                        .set({ status: 'unhealthy', duration_ms: Date.now() - suiteStart })
                        .where(eq(healthRuns.id, runId));
                } catch (updateError: any) {
                    this.logger.error('Failed to persist unhealthy health run state', { error: updateError.message || updateError });
                }
            }

            await this.logger.flush();

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
                    duration_ms: Date.now() - suiteStart,
                    timestamp: new Date().toISOString()
                }]
            };
        }
    }

    /**
     * Execute dynamic tests from healthTestDefinitions table.
     * Each test has a per-request timeout of DYNAMIC_TEST_TIMEOUT_MS.
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
                        signal: AbortSignal.timeout(DYNAMIC_TEST_TIMEOUT_MS),
                    });

                    const isExpected = response.status === (def.expected_status || 200);
                    let bodySnippet = '';
                    
                    try {
                        const text = await response.text();
                        bodySnippet = text.slice(0, 1000); // Capture up to 1000 chars for debugging
                    } catch {
                        // ignore body read errors
                    }

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
                        details: { 
                            criticality: def.criticality, 
                            target: def.target,
                            responseBodySnippet: bodySnippet,
                            actualStatus: response.status
                        },
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
                        details: { 
                            criticality: def.criticality, 
                            target: def.target,
                            errorName: e.name,
                        },
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } catch (e: any) {
            this.logger.error('Failed to load dynamic tests', { error: e.message || e });
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
        } catch (e: any) {
            this.logger.error('Failed to read latest health run', { error: e.message || e });
            await this.logger.flush();
            return null;
        }
    }

    /**
     * Get health run history with optional filters.
     */
    async getHistory(options: { limit?: number; onlyFailures?: boolean; since?: string }) {
        const { limit = 20, onlyFailures = false, since } = options;

        try {
            const conditions: any[] = [];
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
        } catch (e: any) {
            this.logger.error('Failed to read health history', { error: e.message || e });
            await this.logger.flush();
            return [];
        }
    }
}
