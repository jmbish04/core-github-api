# Coding Agent Prompt — Standardize Agents v1

**Read this entire prompt before writing any code.**  
**Reference:** `docs/20260417/standardize_agents/v1/PLAN.md` for full architectural details.  
**Task order:** `docs/20260417/standardize_agents/v1/TASKS.json` — execute tasks in dependency order.

---

## Your Mission

You are implementing a comprehensive standardization of the Cloudflare Agents SDK backend in `src/backend/src/ai/`. This touches the `ai/providers` layer (single source of truth for all AI operations) and all 10 agent classes.

The goal: every agent inherits the same base class, uses the same AIProvider, Logger, StateStore, EdigraphMemory, Skills, Collaboration, and HITL infrastructure — with zero inconsistency.

---

## Ground Rules

1. **Start with the audit (TASK P0-AUDIT).** Before writing any code, grep every agent's method files for hardcoded prompts, hardcoded provider/model strings, and `generateText` calls that instruct JSON output in the prompt. Document what you find. This drives config seeding and catches structural bugs before migration.

2. **Execute tasks in dependency order** as specified by `depends_on` in TASKS.json. Do not skip ahead.

3. **Commit after each phase** (Phase 0 through 3). Each commit should be green (compiles, no broken imports).

4. **TypeScript compilation must be zero-errors at each phase boundary.** Run `npx tsc --noEmit` before committing.

5. **Never delete a file before confirming it is not imported anywhere.** Use grep before any deletion.

6. **Do not change the public `@callable` method signatures** on any agent. Routes, workflow entrypoints, and frontend hooks depend on these — they must stay identical. The only internal change is where `this.ai`, `this.logger`, `this.store` come from (now inherited, not manually initialized).

7. **If a file has significant existing logic in `onStart()`, preserve it inside `agentInit()`** — do not discard agent-specific initialization (DDL migrations, cache warm, state recovery, etc.).

---

## What You Are Building

### Phase 0 — Audit (read-only)
Grep all agent method files. Find and list:
- Hardcoded `systemPrompt` strings (multiline template literals with agent instructions)
- Hardcoded provider strings (e.g., `{ provider: 'gemini' }` or `{ provider: 'worker-ai' }`)
- `generateText()` calls where the prompt says "respond with JSON" or "return a JSON object" → these should use `generateStructuredResponse`
- All `buildSkillContext()` import and call sites

### Phase 1 — Foundation (ai/providers layer)

**P1-TYPES**: Add to `AIOptions` in `types.ts`:
```typescript
skills?: string[];  // Skill names from agent_skills D1 table
```

**P1-SKILLMANAGER**: New file `agent-support/skills.ts`:
```typescript
export class SkillManager {
  constructor(private env: Env) {}
  async getSkillInstructions(skillNames: string[]): Promise<string> {
    if (!skillNames.length) return '';
    try {
      const rows = await getDb(this.env.DB)
        .select({ content: agentSkills.markdownContent })
        .from(agentSkills)
        .where(inArray(agentSkills.name, skillNames));
      if (!rows.length) return '';
      const content = rows.map(r => r.content).join('\n\n---\n\n');
      return `<skill_context>\n${content}\n</skill_context>`;
    } catch (e) {
      // Non-fatal: log warning, return empty
      console.warn('[SkillManager] Failed to load skills:', e);
      return '';
    }
  }
}
```

**P1-GENERATION**: In every generation method in `methods/generation.ts`, add at the start:
```typescript
if (options?.skills?.length) {
  const sm = new SkillManager(ai.env);
  const skillCtx = await sm.getSkillInstructions(options.skills);
  if (skillCtx) systemPrompt = `${systemPrompt ?? ''}\n\n${skillCtx}`.trim();
}
```

**P1-JULES-STRUCTURED**: Formalize two-step in `vendors/jules.ts`. The two-step pattern:
- Step 1: Call Jules with `prompt` + `\n\nRespond with a JSON object matching exactly this schema:\n${JSON.stringify(zodToJsonSchema(schema))}`. Get plain text response.
- Step 2: Call workers-ai `generateStructuredResponse` with `Parse the following content into the exact JSON schema provided:\n${julesResponse}` + same `schema` Zod object. Return structured result.
- This is already partially implemented — complete and ensure it handles errors (if Jules fails, fall back to workers-ai directly).

**P1-HEALTH-BASE**: New file `agent-support/health-base.ts`:
```typescript
export class AgentHealthService {
  static async baseChecks(agentName: string, env: Env, ctx: DurableObjectState): Promise<AgentHealthResult> {
    const checks: Record<string, string> = {};
    // Check DB binding
    checks.db = env.DB ? 'ok' : 'missing';
    // Check AI binding  
    checks.ai = env.AI ? 'ok' : 'missing';
    // Check Edigraph binding (non-fatal)
    checks.edigraph = env.EDGRAPH ? 'ok' : 'not_configured';
    // D1 round-trip (write + delete test row)
    try {
      await env.DB.prepare('SELECT 1').run();
      checks.db_roundtrip = 'ok';
    } catch { checks.db_roundtrip = 'error'; }
    return { agent: agentName, status: Object.values(checks).every(v => v === 'ok' || v === 'not_configured') ? 'ok' : 'degraded', checks, timestamp: Date.now() };
  }
}
```

**P1-BASE-AGENT**: New file `agent-support/base-agent.ts` — see PLAN.md section 2.2 for full class structure. Key points:
- Import from `@cloudflare/agents` for `Agent`, `callable`
- `agentName` is `abstract readonly string`
- `skills` is `protected readonly string[] = []`
- All infrastructure properties initialized in `onStart()`
- `agentInit()` is optional, called at end of `onStart()`
- `healthProbe()` calls `AgentHealthService.baseChecks` + `this.agentHealthChecks()`

**P1-BASE-CHAT-AGENT**: New file `agent-support/base-chat-agent.ts`. Identical to BaseAgent but:
- Extends `AIChatAgent<Env>` from `@cloudflare/agents`
- Adds `verifyChatFormat()` — sends a test message through the agent's message processor and verifies the response is in Vercel AI SDK parts format: `[{ type: 'text', text: string }]`
- `buildFullHealth()` includes `chat_format: await this.verifyChatFormat()`

**P1-STATE-STORE-MIRROR**: Add D1 mirror in `state-store.ts`:
```typescript
private async mirrorToD1(state: State): Promise<void> {
  await getDb(this.env.DB).insert(agentStateMirror)
    .values({ agentId: this.ctx.id.toString(), agentType: this.agentName, stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: agentStateMirror.agentId, set: { stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() } });
}
```
Call `this.ctx.waitUntil(this.mirrorToD1(nextState))` in both `set()` and `patch()`. Never let D1 failure throw — catch and warn.

**P1-COLLAB-SERVICE**: New file `agent-support/collaboration.ts`. Implements the `CollaborationService` class described in PLAN.md section 2.6. Creates/manages CollaborationRoom DO instances via `getAgentByName`. All operations write to D1 `collaborations`, `collaboration_participants`, `collaboration_events` tables (create the schema files too).

**P1-HITL-SERVICE**: New file `agent-support/hitl.ts`. Implements `HumanInTheLoopService` described in PLAN.md section 2.7. Creates D1 schema files for `hitl_proposals`, `hitl_revisions`, `hitl_decisions`.

**P1-EXPORTS**: Wire all new exports through the barrel files.

**P1-CONFIG-SEED**: Add missing `agent_function_configs` entries discovered in P0-AUDIT to `seed.ts`.

### Phase 2 — Agent Migration

For each agent, the pattern is:
```typescript
// BEFORE:
export class MyAgent extends AIChatAgent<Env, MyState> {
  public ai!: AIProvider;
  async onStart() {
    this.ai = new AIProvider(this.env);
    // ... agent-specific init ...
  }
  @callable() async healthProbe() { return { status: 'ok' }; }
}

// AFTER:
export class MyAgent extends BaseChatAgent {  // or BaseAgent for backend agents
  readonly agentName = 'MyAgent';
  protected readonly skills = ['skill-a', 'skill-b'];  // from audit
  
  protected async agentInit() {
    // ONLY agent-specific init here (DDL, cache warm, etc.)
    // AIProvider, Logger, StateStore, HITL, EdigraphService are inherited
  }
  
  // healthProbe() and ping() are inherited — DO NOT duplicate them
  
  protected async agentHealthChecks() {
    // Agent-specific health checks
    return { /* ... */ };
  }
}
```

**Agents that get BaseChatAgent** (frontend chat):
- OrchestratorAgent, ResearchAgent, CloudflareAgent

**Agents that get BaseAgent** (backend):
- EngineerAgent, GithubAgent, GuardrailAgent, LearningAgent, WorkshopAgent, DesignAgent, OverseerAgent

**P2-COLLABORATION-ROOM**: Refactor `ChatRoom/index.ts` → `CollaborationRoom/index.ts`. Class name `CollaborationRoom extends BaseChatAgent` (needs WebSocket for agent broadcast). Delete root `ChatRoom.ts`.

**For each agent migration:**
1. Remove `import { AIProvider }` — inherited
2. Remove `import { Logger }` — inherited  
3. Remove `this.ai = new AIProvider(...)` — inherited
4. Remove `this.logger = new Logger(...)` — inherited
5. Remove existing `healthProbe()` and `ping()` methods — inherited
6. Keep all `@callable()` methods intact (same name, same signature, same logic)
7. Replace all `buildSkillContext(env, agentName)` calls with `options: { skills: this.skills }`
8. Replace all hardcoded `systemPrompt` strings with `await this.ai.getAgentFunctionConfig(this.agentName, 'methodName')` lookup

**P2-DELETE-LEGACY**: After all agents migrated:
- Delete `src/backend/src/ai/agents/ChatRoom.ts`
- Delete `src/backend/src/services/octokit/skill-fetcher.ts`
- Grep for any remaining imports of these deleted files and fix them

### Phase 3 — Integration

**P3-WEBHOOK-HITL**: In `routes/api/webhooks/index.ts`, replace auto-trigger logic:
```typescript
// For each webhook event that would have auto-triggered an agent:
const hitlId = await new HumanInTheLoopService(env).propose({
  type: `webhook-${githubEvent}`,
  proposedAction: buildProposalDescription(githubEvent, payload),
  payload,
  repoOwner: payload.repository?.owner?.login,
  repoName: payload.repository?.name,
});
// Return 200 - action queued for human review
return c.json({ queued: true, hitlId });
```

Add HITL API routes in a new file `routes/api/hitl.ts`:
- `GET /api/hitl` — list proposals (optional ?repoOwner, ?repoName, ?status filters)
- `POST /api/hitl/:id/approve` — approve + execute
- `POST /api/hitl/:id/reject` — reject
- `POST /api/hitl/:id/iterate` — submit feedback, create revision

**P3-HEALTH-COORDINATOR**: In `health/coordinator.ts`, add per-agent health checks — call each agent's `healthProbe()` RPC via `getAgentByName()` with the 8-second timeout pattern already used in the coordinator.

**P3-COMPILE-CHECK**: `npx tsc --noEmit` — zero errors.

**P3-DRY-RUN**: `pnpm run dry-run` — all bindings resolve, including CollaborationRoom.

---

## Verification Checklist

After Phase 3 completes, verify end-to-end:

```bash
# 1. Zero TypeScript errors
npx tsc --noEmit

# 2. Dry-run deployment success
pnpm run dry-run

# 3. Health endpoint — all agents return consistent format
curl https://core-github-api.hacolby.workers.dev/health | jq '.checks | keys'
# Should include: agent:OrchestratorAgent, agent:ResearchAgent, agent:CloudflareAgent, agent:EngineerAgent, etc.

# 4. Skill injection — check Worker logs after triggering OrchestratorAgent.submitBrief
# Look for <skill_context> in the logged system prompt

# 5. Frontend chat (BaseChatAgent agents only)
# Open assistant-ui → chat with OrchestratorAgent → confirm streaming, no spinner
# The healthProbe() chat_format field must return { ok: true }

# 6. Collaboration round-trip
# Trigger EngineerAgent.openCollaboration() via RPC
# Assert: SELECT * FROM collaborations WHERE status='active' returns row

# 7. HITL round-trip  
# POST /api/webhooks with a pull_request event payload
# Assert: SELECT * FROM hitl_proposals returns pending row
# POST /api/hitl/:id/approve
# Assert: SELECT * FROM hitl_decisions returns approved row
```

---

## Key Files Reference

| File | Role |
|------|------|
| `ai/providers/types.ts` | AIOptions interface — add skills field here |
| `ai/providers/methods/generation.ts` | All generation methods — inject skills here |
| `ai/providers/agent-support/skills.ts` | NEW: SkillManager |
| `ai/providers/agent-support/base-agent.ts` | NEW: BaseAgent abstract class |
| `ai/providers/agent-support/base-chat-agent.ts` | NEW: BaseChatAgent abstract class |
| `ai/providers/agent-support/health-base.ts` | NEW: AgentHealthService |
| `ai/providers/agent-support/collaboration.ts` | NEW: CollaborationService |
| `ai/providers/agent-support/hitl.ts` | NEW: HumanInTheLoopService |
| `ai/providers/agent-support/state-store.ts` | ADD: D1 mirror on write |
| `ai/providers/vendors/jules.ts` | FORMALIZE: two-step generateStructuredResponse |
| `ai/providers/agent-support/index.ts` | BARREL: export all new classes |
| `ai/providers/index.ts` | BARREL: re-export BaseAgent, BaseChatAgent |
| `db/services/agent-config/seed.ts` | ADD: missing agent function configs |
| `db/schemas/agents/collaborations.ts` | NEW: collaboration D1 schema |
| `db/schemas/agents/hitl.ts` | NEW: HITL D1 schema |
| `ai/agents/CollaborationRoom/index.ts` | NEW: refactored from ChatRoom/ |
| `ai/agents/exports.ts` | UPDATE: CollaborationRoom reference |
| `routes/api/webhooks/index.ts` | MODIFY: HITL propose instead of auto-trigger |
| `routes/api/hitl.ts` | NEW: HITL API routes |
| `health/coordinator.ts` | ADD: per-agent health checks |

## Files to Delete

| File | Confirmed Safe? |
|------|----------------|
| `ai/agents/ChatRoom.ts` | Not in exports.ts — safe to delete |
| `services/octokit/skill-fetcher.ts` | Replaced by SkillManager — remove all imports first |
