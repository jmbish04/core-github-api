
import { Hono } from 'hono';
import { Bindings } from "@utils/hono";
import { HealthCoordinator } from "@/health/coordinator";
import { getDb } from "@/db";
import { z } from 'zod';
import { healthTestDefinitions } from "@/db/schemas/logs/health";
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

const healthApi = new Hono<{ Bindings: Env }>();

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
    const { failureDetails, context } = body;

    if (!failureDetails) return c.json({ error: 'Missing failureDetails' }, 400);

    // Call HealthDiagnostician
    if (!c.env.HEALTH_DIAGNOSTICIAN) {
        return c.json({ error: 'HEALTH_DIAGNOSTICIAN binding not found' }, 500);
    }
    
    const agentId = c.env.HEALTH_DIAGNOSTICIAN.idFromName('singleton');
    const agentStub = c.env.HEALTH_DIAGNOSTICIAN.get(agentId);

    const response = await agentStub.fetch("http://do/diagnose", {
        method: "POST",
        body: JSON.stringify({
            errorName: failureDetails.name || 'Unknown Error',
            errorMessage: failureDetails.message || 'No message provided',
            errorDetails: failureDetails.details || {},
            category: failureDetails.category || 'unknown',
            target: failureDetails.name || 'unknown'
        })
    });

    if (!response.ok) {
        return c.json({ error: await response.text() }, 500);
    }

    const rawAnalysis = await response.json<{ severity: string; rootCause: string; suggestedFix: string; prUrl: string | null }>();
    
    // Transform back to the UI expected format
    return c.json({
        analysis: `[${rawAnalysis.severity}] ${rawAnalysis.rootCause}`,
        fixes: [rawAnalysis.suggestedFix, rawAnalysis.prUrl ? `Applied Fix PR/Jules: ${rawAnalysis.prUrl}` : ""].filter(Boolean),
        severity: rawAnalysis.severity
    });
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
