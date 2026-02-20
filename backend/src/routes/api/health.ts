
import { Hono } from 'hono';
import { Bindings } from "@utils/hono";
import { HealthCoordinator } from "@/health/coordinator";
import { DeepReasoningAgent } from "@/ai/agents/DeepReasoning";
import { z } from 'zod';
import { getAgentByName } from 'agents';
import { resolveDefaultAiProvider } from "@/ai/providers/config";
import { getDb } from "@/db";
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

    // Call DeepReasoningAgent
    const getByName = getAgentByName as any;
    const stub = await getByName(c.env.DEEP_REASONING_AGENT, 'health-analyzer');

    const prompt = `
    Analyze this system health failure and provide actionable fixes.
    
    Context: ${context || 'General System Health Check'}
    Failure: ${JSON.stringify(failureDetails, null, 2)}
    
    Provide a concise technical explanation and 1-3 step-by-step fixes.
    `;

    const schema = {
        type: "object",
        properties: {
            analysis: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "critical"] },
            fixes: {
                type: "array",
                items: { type: "string" }
            }
        },
        required: ["analysis", "fixes"]
    };

    const response = await stub.fetch("http://agent/reason", {
        method: "POST",
        body: JSON.stringify({
            prompt,
            schema,
            provider: resolveDefaultAiProvider(c.env),
            reasoningParams: { effort: "medium", summary: "concise" }
        })
    });

    if (!response.ok) {
        return c.json({ error: await response.text() }, 500);
    }

    return c.json(await response.json());
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
