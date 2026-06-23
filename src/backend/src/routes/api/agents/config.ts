/**
 * @file routes/api/agents/config.ts
 * @description REST API for the centralized agent function config store.
 *
 * Endpoints:
 *   GET    /api/agents/config           — list all configs (?agent= filter)
 *   GET    /api/agents/config/:id       — get single config
 *   POST   /api/agents/config           — upsert config
 *   DELETE /api/agents/config/:id       — soft-delete (isActive=false)
 *   POST   /api/agents/config/seed      — seed defaults for all 10 agents
 *   POST   /api/agents/config/:id/jules — trigger Jules coding session to enforce change in code
 *
 * @module Routes/Agents/Config
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AgentConfigService } from '@/db/services/agent-config';
import { AGENT_CONFIG_SEED } from '@/db/services/agent-config/seed';
import { JulesService } from '@/services/jules';

const app = new Hono<{ Bindings: Env }>();

// ── Validation Schemas ────────────────────────────────────────────────────────

const UpsertSchema = z.object({
  agentName: z.string().min(1),
  functionName: z.string().min(1),
  label: z.string().optional(),
  primaryProvider: z.string().optional(),
  primaryModel: z.string().optional(),
  secondaryProvider: z.string().optional(),
  secondaryModel: z.string().optional(),
  systemInstructions: z.string().optional(),
  promptTemplate: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const JulesEnforceSchema = z.object({
  /**
   * If true, Jules will pause at its plan and wait for human approval
   * before coding. Defaults to true for safety.
   */
  requireApproval: z.boolean().default(true),
  /**
   * If true, Jules will automatically open a PR when done.
   */
  autoPr: z.boolean().default(true),
  /**
   * Optional extra context for the Jules prompt.
   */
  additionalContext: z.string().optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /api/agents/config — list all (optional ?agent=OrchestratorAgent) */
app.get('/', async (c) => {
  const svc = new AgentConfigService(c.env);
  const agentFilter = c.req.query('agent');
  const configs = await svc.listConfigs(agentFilter);
  return c.json({ configs });
});

/** GET /api/agents/config/:id — single row */
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const svc = new AgentConfigService(c.env);
  const all = await svc.listConfigs();
  const config = all.find((r) => r.id === id);
  if (!config) return c.json({ error: 'Not found' }, 404);

  return c.json({ config });
});

/** POST /api/agents/config — upsert */
app.post('/', zValidator('json', UpsertSchema), async (c) => {
  const body = c.req.valid('json');
  const svc = new AgentConfigService(c.env);
  const config = await svc.upsertConfig(body);
  return c.json({ config }, 201);
});

/** DELETE /api/agents/config/:id — soft-delete */
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const svc = new AgentConfigService(c.env);
  await svc.deactivateConfig(id);
  return c.json({ success: true });
});

/** POST /api/agents/config/seed — bulk-insert all seed defaults */
app.post('/seed', async (c) => {
  const svc = new AgentConfigService(c.env);
  const results: string[] = [];

  for (const row of AGENT_CONFIG_SEED) {
    try {
      await svc.upsertConfig(row);
      results.push(`✓ ${row.agentName}.${row.functionName}`);
    } catch (err: any) {
      results.push(`✗ ${row.agentName}.${row.functionName}: ${err.message}`);
    }
  }

  return c.json({ seeded: results.length, results });
});

/**
 * POST /api/agents/config/:id/jules
 * Trigger a Jules coding session to enforce the config change in source code.
 * Jules will open a PR against the `core-github-api` repository.
 */
app.post('/:id/jules', zValidator('json', JulesEnforceSchema), async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const { requireApproval, autoPr, additionalContext } = c.req.valid('json');

  // Fetch the config row to build the Jules prompt
  const svc = new AgentConfigService(c.env);
  const all = await svc.listConfigs();
  const config = all.find((r) => r.id === id);
  if (!config) return c.json({ error: 'Config not found' }, 404);

  const prompt = buildJulesPrompt(config, additionalContext);

  const jules = JulesService.getInstance(c.env);
  const session = await jules.startSession({
    prompt,
    repo: {
      owner: 'jmbish04',
      repo: 'core-github-api',
      branch: 'main',
    },
    requireApproval,
    autoPr,
    title: `[AgentConfig] ${config.agentName}.${config.functionName} — enforce AI config`,
  });

  return c.json({
    success: true,
    sessionId: session.id,
    message: `Jules session started. ${requireApproval ? 'Waiting for plan approval.' : 'Auto-coding in progress.'}`,
    config,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildJulesPrompt(
  config: {
    agentName: string;
    functionName: string;
    primaryProvider?: string | null;
    primaryModel?: string | null;
    secondaryProvider?: string | null;
    secondaryModel?: string | null;
    systemInstructions?: string | null;
    promptTemplate?: string | null;
    notes?: string | null;
  },
  additionalContext?: string,
): string {
  return `# Agent Config Enforcement Task

An operator has updated the AI configuration for \`${config.agentName}.${config.functionName}\` via the Frontend Config UI.

## New Configuration

| Field | Value |
|-------|-------|
| Agent | \`${config.agentName}\` |
| Function | \`${config.functionName}\` |
| Primary Provider | \`${config.primaryProvider ?? 'gemini'}\` |
| Primary Model | \`${config.primaryModel ?? 'gemini-2.0-flash'}\` |
| Secondary Provider | \`${config.secondaryProvider ?? 'worker-ai'}\` |
| Secondary Model | \`${config.secondaryModel ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast'}\` |

## System Instructions Override
${config.systemInstructions ? `\`\`\`\n${config.systemInstructions}\n\`\`\`` : '_No override — using hardcoded default._'}

## Task

Update the source file for \`${config.agentName}\` method \`${config.functionName}\` so that:

1. The PRIMARY provider/model constants at the top of the file reflect the new values above.
2. The agent calls \`this.ai.getAgentFunctionConfig('${config.agentName}', '${config.functionName}')\` at runtime (so future D1 changes take effect without code changes).
3. The \`DEFAULT_SYSTEM_INSTRUCTIONS\` constant matches the system instructions above (if provided).
4. Any hardcoded \`generateText\` or \`generateStructuredResponse\` calls pass the config's provider/model as options.

Follow the established pattern in \`src/backend/src/ai/agents/OrchestratorAgent/methods/parse-request.ts\` as the canonical reference implementation.

Do NOT change the function's external interface or return type.
Do NOT add any new dependencies beyond what already exists in the file.

${additionalContext ? `## Additional Context from Operator\n${additionalContext}` : ''}

## Reference Implementation
See: \`src/backend/src/ai/agents/OrchestratorAgent/methods/parse-request.ts\`
`;
}

export default app;
