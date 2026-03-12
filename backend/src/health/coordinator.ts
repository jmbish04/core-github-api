
import { getDb } from '@db';
import { healthRuns, healthResults, healthTestDefinitions } from '@db/schemas/logs/health';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, gt } from 'drizzle-orm';
import { HealthResult, HealthCategory, HealthStepResult } from './types';
import { analyzeFailure } from '@/ai/utils/diagnostician';

// ─── Import ALL distributed modular checks ──────────────────────────────
import { checkGitHubAPIHealth, checkWebhooksHealth, checkGitHubAppAuthHealth } from '@/workflows/health';
import { checkHealth as checkAIHealth } from '@/ai/health';
import { checkHealth as checkAgentsHealth } from '@/ai/agents/health';
import { checkHealth as checkMCPHealth } from '@/ai/mcp/health';
import { checkHealth as checkBrowserHealth } from '@/ai/mcp/tools/browser/health';
import { checkGitHealth, checkSandboxHealth } from '@/ai/mcp/tools/github/git-sandbox-health';
import { checkAPIHealth } from '@/routes/api/health';
import { checkHealth as checkPlanningHealth } from '@/workflows/planning/health';
import { checkHealth as checkResearchHealth } from '@/workflows/research/health';

// ─── Check Registry ──────────────────────────────────────────────────────
// Each check returns HealthStepResult and maps to a category for D1 persistence.
interface RegisteredCheck {
    id: string;
    category: HealthCategory;
    fn: (env: Env) => Promise<HealthStepResult>;
}

const CODE_CHECKS: RegisteredCheck[] = [
    { id: 'db',       category: 'api',      fn: checkAPIHealth },
    { id: 'ai',       category: 'ai',       fn: checkAIHealth },
    { id: 'agents',   category: 'agents',   fn: checkAgentsHealth },
    { id: 'mcp',      category: 'mcp',      fn: checkMCPHealth },
    { id: 'browser',  category: 'browser',  fn: checkBrowserHealth },
    { id: 'github_app',category: 'github',  fn: checkGitHubAppAuthHealth },
    { id: 'github',   category: 'github',   fn: checkGitHubAPIHealth },
    { id: 'webhooks', category: 'webhooks', fn: checkWebhooksHealth },
    { id: 'git',      category: 'git',      fn: checkGitHealth },
    { id: 'sandbox',  category: 'sandbox',  fn: checkSandboxHealth },
    { id: 'deep_research', category: 'research', fn: checkResearchHealth },
    { id: 'planning', category: 'planning', fn: checkPlanningHealth },
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
                const checkStart = Date.now();
                try {
                    return { check, result: await check.fn(this.env) };
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
                                errorStack: e.stack,
                                errorCause: e.cause,
                                category: check.category
                            },
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

                // Dispatch failure to the dedicated Agent DO
                if (result.status === 'failure' && this.env.HEALTH_DIAGNOSTICIAN) {
                    try {
                        const agentId = this.env.HEALTH_DIAGNOSTICIAN.idFromName('singleton');
                        const agentStub = this.env.HEALTH_DIAGNOSTICIAN.get(agentId);
                        
                        const diagnosticResponse = await agentStub.fetch("http://do/diagnose", {
                            method: "POST",
                            body: JSON.stringify({
                                errorName: result.name,
                                errorMessage: result.message || 'Unknown failure',
                                errorDetails: result.details || { notice: 'No details provided' },
                                category: check.category,
                                target: result.name
                            })
                        });

                        if (diagnosticResponse.ok) {
                            const rawAnalysis = await diagnosticResponse.json<{ severity: string, rootCause: string, suggestedFix: string, prUrl: string | null }>();
                            aiSuggestion = `[${rawAnalysis.severity}] ${rawAnalysis.rootCause} — Fix: ${rawAnalysis.suggestedFix}`;
                            if (rawAnalysis.prUrl) {
                                aiSuggestion += `\nApplied Fix PR: ${rawAnalysis.prUrl}`;
                            }
                            result.analysis = {
                                severity: rawAnalysis.severity as any,
                                rootCause: rawAnalysis.rootCause,
                                suggestedFix: rawAnalysis.suggestedFix,
                                confidence: 1.0,
                                fixPrompt: "Remediation managed by autonomous HealthDiagnostician DO"
                            };
                        }
                    } catch (e) {
                        console.error("Agent Diagnostic DO Call Failed", e);
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
            for (const r of dynamicResults) {
                if (r.status === 'failure' && this.env.HEALTH_DIAGNOSTICIAN) {
                    try {
                        const agentId = this.env.HEALTH_DIAGNOSTICIAN.idFromName('singleton');
                        const agentStub = this.env.HEALTH_DIAGNOSTICIAN.get(agentId);
                        const diagnosticResponse = await agentStub.fetch("http://do/diagnose", {
                            method: "POST",
                            body: JSON.stringify({
                                errorName: r.name,
                                errorMessage: r.message,
                                errorDetails: r.details,
                                category: r.category,
                                target: r.name
                            })
                        });
                        if (diagnosticResponse.ok) {
                            const rawAnalysis = await diagnosticResponse.json<{ severity: string, rootCause: string, suggestedFix: string, prUrl: string | null }>();
                            r.ai_suggestion = `[${rawAnalysis.severity}] ${rawAnalysis.rootCause} — Fix: ${rawAnalysis.suggestedFix}`;
                            if (rawAnalysis.prUrl) {
                                r.ai_suggestion += `\nApplied Fix PR: ${rawAnalysis.prUrl}`;
                            }
                        }
                    } catch (e) {
                        console.error("Dynamic test agent diagnostic failed", e);
                    }
                }
                results.push(r);
            }

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
                    let bodySnippet = '';
                    
                    try {
                        const text = await response.text();
                        bodySnippet = text.slice(0, 1000); // Capture up to 1000 chars for AI debugging
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
                            errorStack: e.stack,
                            errorCause: e.cause
                        },
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
        } catch (e) {
            console.error('Failed to read health history', e);
            return [];
        }
    }
}
