/**
 * @file routes/api/agents/health.ts
 * @description Per-agent health probe API.
 *
 * POST /api/agents/health/:agentName  → deep-mode probe (user-triggered)
 * GET  /api/agents/health             → list all agents + fast summary
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  probeAgentDeep,
  checkAgentsHealth,
  getRegisteredAgentNames,
} from '@/health/checks/agents-health';

const agentHealthApi = new OpenAPIHono<{ Bindings: Env }>();

// ── GET /api/agents/health ─────────────────────────────────────────────────
// Fast-mode summary of all agents (zero tokens, cron-safe)

const listRoute = createRoute({
  method: 'get',
  path: '/',
  operationId: 'listAgentHealth',
  tags: ['Agents', 'Health'],
  summary: 'Fast health summary of all registered agents',
  responses: {
    200: {
      description: 'All agent health reports (fast mode)',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string(),
            agents: z.record(z.string(), z.any()),
            durationMs: z.number(),
          }),
        },
      },
    },
  },
});

agentHealthApi.openapi(listRoute, async (c) => {
  const result = await checkAgentsHealth(c.env);
  return c.json({
    status: result.status,
    agents: result.details?.agents ?? {},
    durationMs: result.durationMs,
    registered: getRegisteredAgentNames(),
  });
});

// ── POST /api/agents/health/:agentName ──────────────────────────────────────
// Deep-mode probe of a single agent (user-triggered, may consume AI tokens)

const deepProbeRoute = createRoute({
  method: 'post',
  path: '/:agentName',
  operationId: 'deepProbeAgent',
  tags: ['Agents', 'Health'],
  summary: 'Deep health probe of a specific agent (includes AI round-trip)',
  request: {
    params: z.object({
      agentName: z.string().describe('Name of the agent to deep-probe (e.g. GuardrailAgent)'),
    }),
  },
  responses: {
    200: {
      description: 'Full health report for the agent',
      content: {
        'application/json': {
          schema: z.object({
            agentName: z.string(),
            report: z.any().optional().nullable(),
            error: z.string().optional(),
          }),
        },
      },
    },
  },
});

agentHealthApi.openapi(deepProbeRoute, async (c) => {
  const { agentName } = c.req.valid('param');
  const result = await probeAgentDeep(c.env, agentName);
  return c.json(result);
});

export default agentHealthApi;
