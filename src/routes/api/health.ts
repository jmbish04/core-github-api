
import { Hono } from 'hono';
import { Bindings } from '../../utils/hono';
import { HealthCoordinator } from '../../health/coordinator';
import { DeepReasoningAgent } from '../../agents/deep-reasoning';
import { z } from 'zod';

const healthApi = new Hono<{ Bindings: Bindings }>();

// GET /latest
healthApi.get('/latest', async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const data = await coordinator.getLatestRun();
    return c.json(data || { message: 'No health runs found' });
});

// POST /run
healthApi.post('/run', async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    // Run async? Or await? User wants realtime spinner, so await is better for immediate feedback.
    const result = await coordinator.runAllChecks('api');
    return c.json(result);
});

// POST /analyze
healthApi.post('/analyze', async (c) => {
    const body = await c.req.json();
    const { failureDetails, context } = body;

    if (!failureDetails) return c.json({ error: 'Missing failureDetails' }, 400);

    // Call DeepReasoningAgent
    const agentId = c.env.DEEP_REASONING_AGENT.idFromName('health-analyzer');
    const stub = c.env.DEEP_REASONING_AGENT.get(agentId);

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

    const response = await stub.fetch("http://internal/reason", {
        method: "POST",
        body: JSON.stringify({
            prompt,
            schema,
            reasoningParams: { effort: "medium", summary: "concise" }
        })
    });

    if (!response.ok) {
        return c.json({ error: await response.text() }, 500);
    }

    return c.json(await response.json());
});

export default healthApi;
