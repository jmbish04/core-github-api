
import { Hono } from 'hono';

import { HealthCoordinator } from "@/health/coordinator";
import { getDb } from "@/db";
import { z } from 'zod';
import { healthTestDefinitions } from "@/db/schemas/logs/health";
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { App } from 'octokit';
import { getGitHubPrivateKey, getGitHubAppId, getGithubToken } from "@utils/secrets";
import { getAgentByName } from 'agents';
import { seedGoldenPathDefaults } from "@/services/golden-path-seed";

const healthApi = new Hono<{ Bindings: Env }>();

// POST /seed — temporary endpoint to seed golden paths
healthApi.post('/seed', async (c) => {
    try {
        const result = await seedGoldenPathDefaults(c.env);
        return c.json(result);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

// GET /latest — most recent run with results
healthApi.get('/latest', async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const data = await coordinator.getLatestRun();
    return c.json(data || { message: 'No health runs found' });
});

// GET /history — paginated run history with filters
healthApi.get('/history', async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const limit = Number(c.req.query('limit') || 20);
    const onlyFailures = c.req.query('onlyFailures') === 'true';
    const since = c.req.query('since') || undefined;

    const history = await coordinator.getHistory({ limit, onlyFailures, since });
    return c.json({
        runs: history,
        count: history.length,
        filters: { limit, onlyFailures, since }
    });
});

// POST /run — trigger immediate health suite
healthApi.post('/run', async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const result = await coordinator.runAllChecks('api');
    return c.json(result);
});

// POST /analyze — AI-powered failure analysis via Deep Reasoning Agent
healthApi.post('/analyze', async (c) => {
    const body = await c.req.json();
    const { failureDetails } = body;

    if (!failureDetails) return c.json({ error: 'Missing failureDetails' }, 400);

    // Call HealthDiagnostician
    if (!c.env.LEARNING_AGENT) {
        return c.json({ error: 'HEALTH_DIAGNOSTICIAN binding not found' }, 500);
    }
    
    const agent = await getAgentByName(c.env.LEARNING_AGENT as any, 'singleton');
    const rawAnalysis = await (agent as any).diagnoseHealth({
        errorName: failureDetails.name || 'Unknown Error',
        errorMessage: failureDetails.message || 'No message provided',
        errorDetails: failureDetails.details || {},
        category: failureDetails.category || 'unknown',
        target: failureDetails.name || 'unknown',
    }) as { severity: string; rootCause: string; suggestedFix: string; prUrl: string | null };
    
    // Transform back to the UI expected format
    return c.json({
        analysis: `[${rawAnalysis.severity}] ${rawAnalysis.rootCause}`,
        fixes: [rawAnalysis.suggestedFix, rawAnalysis.prUrl ? `Applied Fix PR/Jules: ${rawAnalysis.prUrl}` : ""].filter(Boolean),
        severity: rawAnalysis.severity
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /github-app-webhooks
//
// PURPOSE: Verifies that the GitHub App webhook is correctly configured and
//          that recent deliveries are succeeding.
//
// AUTHENTICATION: Uses the GitHub App JWT (App-level auth via `new App({...})`).
//   This requires `appId` and `privateKey` — NOT an installation token.
//   App-level endpoints like `apps.getWebhookConfigForApp` and
//   `apps.listWebhookDeliveries` CANNOT be called with installation tokens.
//
// WHAT IT CHECKS:
//   1. Fetches the webhook URL currently configured in the GitHub App settings.
//   2. Compares it against `env.WEBHOOK_URL` (wrangler.jsonc var).
//      The expected value is:
//        https://core-github-api.hacolby.workers.dev/api/webhooks
//   3. Scans the 50 most recent deliveries for failures (status_code >= 400).
//   4. Returns health status: healthy | degraded | unhealthy.
//
// ⚠️  If this check returns `urlMatchesExpected: false`, you MUST update the
//     Webhook URL in the GitHub App settings to match `env.WEBHOOK_URL`.
// ─────────────────────────────────────────────────────────────────────────────
healthApi.get('/github-app-webhooks', async (c) => {
    const start = Date.now();

    try {
        const appId = await getGitHubAppId(c.env);
        const privateKey = await getGitHubPrivateKey(c.env);

        if (!appId || !privateKey) {
            return c.json({
                status: 'unhealthy',
                error: 'GitHub App credentials (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY) are missing.',
            }, 500);
        }

        // Expected canonical webhook URL — sourced from env to ensure it matches wrangler.jsonc
        const expectedWebhookUrl = c.env.WEBHOOK_URL || 'https://core-github-api.hacolby.workers.dev/api/webhooks';

        // Authenticate as the GitHub App using a JWT (required for app-level endpoints)
        const githubApp = new App({
            appId: String(appId),
            privateKey: String(privateKey).replace(/\\n/g, '\n'),
        });

        // 1. Check the webhook URL configured in the GitHub App settings
        const configResponse = await githubApp.octokit.rest.apps.getWebhookConfigForApp();
        const currentWebhookUrl: string = (configResponse.data as any).url ?? '';
        const urlMatchesExpected = currentWebhookUrl === expectedWebhookUrl;

        // 2. Scan the 50 most recent webhook deliveries for failures
        const deliveriesResponse = await githubApp.octokit.rest.apps.listWebhookDeliveries({ per_page: 50 });
        const deliveries = deliveriesResponse.data as any[];

        const failedDeliveries = deliveries.filter((d: any) => d.status_code >= 400 || d.status !== 'OK');

        const mappedFailed = failedDeliveries.map((d: any) => ({
            id: d.id,
            guid: d.guid,
            event: d.event,
            action: d.action ?? null,
            delivered_at: d.delivered_at,
            status: d.status,
            status_code: d.status_code,
            redelivery: d.redelivery,
        }));

        // 3. Determine overall health status
        let status: 'healthy' | 'degraded' | 'unhealthy';
        if (!urlMatchesExpected) {
            // URL misconfiguration is always critical — ALL events go to the wrong place
            status = 'unhealthy';
        } else if (failedDeliveries.length > 10) {
            status = 'unhealthy';
        } else if (failedDeliveries.length > 0) {
            status = 'degraded';
        } else {
            status = 'healthy';
        }

        return c.json({
            status,
            webhookUrl: currentWebhookUrl,
            expectedWebhookUrl,
            urlMatchesExpected,
            recentDeliveriesTotal: deliveries.length,
            failedDeliveriesTotal: failedDeliveries.length,
            failedDeliveries: mappedFailed,
            durationMs: Date.now() - start,
        });
    } catch (err: any) {
        console.error('[health/github-app-webhooks] Error:', err);
        return c.json({
            status: 'unhealthy',
            error: err.message || 'Unknown error communicating with GitHub API',
            durationMs: Date.now() - start,
        }, 500);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /research-dry-run
//
// PURPOSE: Triggers the `research-health-check` event in the research queue repo.
// ─────────────────────────────────────────────────────────────────────────────
healthApi.post('/research-dry-run', async (c) => {
    const start = Date.now();
    try {
        const ghToken = await getGithubToken(c.env);
        if (!ghToken) {
            return c.json({ status: 'error', error: "Missing GH_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN" }, 500);
        }

        const dispatcherUri = c.env.RESEARCH_QUEUE_REPO_DISPATCHER_URI || "https://api.github.com/repos/jmbish04/core-github-research/dispatches";

        const res = await fetch(dispatcherUri, {
            method: "POST",
            headers: {
                "Accept": "application/vnd.github.v3+json",
                "Authorization": `Bearer ${ghToken}`,
                "User-Agent": "Core-GitHub-API-Health",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                event_type: "research-health-check",
                client_payload: {
                    timestamp: new Date().toISOString()
                }
            })
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`GitHub API responded with ${res.status}: ${body}`);
        }

        return c.json({
            status: "success",
            message: "Dry-run dispatch sent successfully",
            durationMs: Date.now() - start
        });
    } catch (err: any) {
        console.error('[health/research-dry-run] Error:', err);
        return c.json({
            status: "error",
            error: err.message,
            durationMs: Date.now() - start
        }, 500);
    }
});



// ─── Dynamic Test Definitions CRUD ──────────────────────────────────────

const TestDefinitionSchema = z.object({
    name: z.string().min(1).max(100),
    target: z.string().url(),
    method: z.enum(['GET', 'POST']).default('GET'),
    expected_status: z.number().int().min(100).max(599).default(200),
    frequency_seconds: z.number().int().min(60).default(604800),
    criticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    enabled: z.boolean().default(true),
});

// GET /tests — list all test definitions
healthApi.get('/tests', async (c) => {
    const db = getDb(c.env.DB);
    const tests = await db.select().from(healthTestDefinitions);
    return c.json({ tests, count: tests.length });
});

// POST /tests — create a new test definition
healthApi.post('/tests', async (c) => {
    const body = await c.req.json();
    const parsed = TestDefinitionSchema.safeParse(body);

    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.flatten() }, 400);
    }

    const db = getDb(c.env.DB);
    const newTest = {
        id: uuidv4(),
        ...parsed.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    await db.insert(healthTestDefinitions).values(newTest);
    return c.json({ created: newTest }, 201);
});

// DELETE /tests/:id — remove a test definition
healthApi.delete('/tests/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env.DB);
    await db.delete(healthTestDefinitions).where(eq(healthTestDefinitions.id, id));
    return c.json({ deleted: id });
});

export default healthApi;
