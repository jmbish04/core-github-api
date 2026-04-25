# v5 Follow-Up — Coding Agent Prompt

**Read this entire prompt before writing any code.**
**PRD:** `docs/20260417/standardize_agents/v5/followup/PRD.md`
**Task order:** `docs/20260417/standardize_agents/v5/followup/TASKS.json`
**Parent plan (for reference):** `docs/20260417/standardize_agents/v5/PLAN.md`

---

## Context You Must Start With

A Phase 0 audit found that **v5 Phase 1 (Foundation) and most of Phase 3 (Agent Migration) is already landed in the codebase.** The v5 plan assumed it would build those from scratch. This follow-up is the remaining surgical work.

**Already in place — do NOT reimplement:**

- `BaseAgent` and `BaseChatAgent` abstract classes in `src/backend/src/ai/providers/agent-support/`
- `SkillManager` with cache, prefetch, resolveEffective, `extractHeaders()` for the X-Agent-Skills header
- `AIProvider.skills` public property + `warmSkillCache()`
- Skill injection in all 6 generation methods via `resolveSystemPrompt()`
- `AgentStateStore` with D1 mirror on set/patch
- `HitlQueue` class and `hitlQueue` D1 table (single table — NOT three)
- `CollaborationService` class and `collaboration_sessions/participants/events` tables
- Jules two-step with `skillContext` bypass
- `CollaborationSpace/` directory (renamed from ChatRoom)
- 10 of 11 agents already extend `BaseAgent` or `BaseChatAgent`
- OverseerAgent already removed from wrangler bindings

**What's left** — see TASKS.json. Four categories:

1. Foundation polish (`ping()` on BaseAgent, `verifyChatFormat()` on BaseChatAgent)
2. Agent refinements (3 JSON-via-generateText bugs, 3 new CloudflareAgent methods, WorkshopAgent peer orchestration, GuardrailAgent CF consult)
3. Legacy cleanup (`todo_integration/`, `skill-fetcher.ts`, `OverseerAgent/`)
4. Phase 4/5 work (HITL routes, webhook HITL, health coordinator, route modularization, wrangler reset, chat schema unification)

---

## Non-Negotiable Technical Rules

Each rule is a bug if violated. These are inherited from v5/PROMPT.md.

### Rule 1: AIChatAgent from `"agents"` — not `"@cloudflare/ai-chat"`
Backend base class imports must be `import { Agent, AIChatAgent, callable } from "agents"`. `@cloudflare/ai-chat` is a frontend-only React package.

### Rule 2: No live inference in health probes
`verifyChatFormat()` must be static-only. Use `AbortSignal.timeout(0)` to probe `streamText({ ..., abortSignal })` and verify `toUIMessageStreamResponse` is a function. The AbortError that fires before any network call is the expected success path.

### Rule 3: HITL is a single `hitlQueue` table
v5 Plan mentions `hitlProposals/hitlRevisions/hitlDecisions`. Reality is one `hitlQueue` table with `status` enum ('pending'|'approved'|'rejected'|'expired'). Import from `src/backend/src/db/schemas/workflows/hitl.ts`. Do NOT create new HITL tables.

### Rule 4: System prompts from `getAgentFunctionConfig()`
When replacing hardcoded system prompts, use `await this.ai.getAgentFunctionConfig(agentName, methodName)` and fall back to a minimal default if null.

### Rule 5: AgentStateStore object-param constructor
`new AgentStateStore({ ctx, env, agentName, initialState })` — object param, never positional.

### Rule 6: `onChatMessage()` — not `onMessage()`
BaseChatAgent's hook is `onChatMessage(onFinish)`. `onMessage` is the raw WebSocket hook and must not be overridden for chat.

### Rule 7: `keepAliveWhile()` for long tasks
Jules sessions, multi-step workflows, and anything that can exceed 70 seconds must be wrapped in `this.keepAliveWhile(() => ...)`.

### Rule 8: `@callable()` signatures are immutable
Do not rename or retype any existing parameter on any existing `@callable()` method. Routes, workflows, and frontend hooks depend on them.

### Rule 9: Never `agent.fetch(new Request(...))`
Use `@callable()` RPC: `const stub = this.env.AGENT.getByName('default'); await stub.methodName(args)`. The only allowed exception is SSE streaming, which must be documented inline with a comment.

### Rule 10: All AI calls through `this.ai`
`this.ai.generateText(prompt, system, { skills: this.skills })`. Never import vendor SDKs directly in agent files.

### Rule 11: Grep before deleting
Before deleting any file or directory, run `grep -rn '<name>' src/` and confirm zero import sites. If any exist, fix them first.

### Rule 12: OverseerAgent is dissolved, not migrated
Already unbound from wrangler. Delete the directory only after the wrangler reset (I8).

---

## Task Tracking Protocol

- Before starting any task: read its entry in TASKS.json and validate every `success_criteria` is achievable.
- After completing a task: re-read `success_criteria` and confirm each.
- Run `npx tsc --noEmit` after every task (not just every phase).
- Do not proceed to a dependent task until its predecessor's success criteria all pass.
- Report a task complete ONLY when every criterion is met.

---

## Execution Order

The TASKS.json `execution_order` array is authoritative. Groups in brackets run in parallel.

```
F1  ping() on BaseAgent
F2  verifyChatFormat() on BaseChatAgent
───────────────────────────────────────────────
[A1, A2, A3]  ResearchAgent / GithubAgent / GuardrailAgent JSON fixes
───────────────────────────────────────────────
A4  CloudflareAgent 3 new @callable methods
[A5, A6]  WorkshopAgent orchestration + GuardrailAgent consult
A8  LearningAgent base class decision
───────────────────────────────────────────────
C2  Delete todo_integration/ dirs
C3  Verify zero buildSkillContext
C4  Delete skill-fetcher.ts
───────────────────────────────────────────────
I1  thread_participants table + migration
I2  routes/api/hitl.ts
I3  Webhook HITL integration (depends I2)
I4  Per-agent health coordinator
I5  Fix agent.fetch anti-patterns
I6  Fix sentinel binding refs
I7  Route modularization (depends I5)
I8  Wrangler fresh v1 reset (depends A5, I1)
───────────────────────────────────────────────
C1  Delete OverseerAgent/ (depends I8)
───────────────────────────────────────────────
I9  shared/chat-persistence.ts (depends I1)
I10 CollaborationSpace mirroring (depends I9)
I11 Deprecate old chat schemas (depends I10)
───────────────────────────────────────────────
V1  Final verification
```

Commit after each logical batch (Foundation polish, Agent fixes, CF+Workshop, Cleanup, each major I-phase group).

---

## Critical Implementation Details

### F2 — `verifyChatFormat()`

```typescript
private async verifyChatFormat(): Promise<{ ok: boolean; error?: string }> {
  try {
    const env = this.env as any;
    if (!env.AI) return { ok: false, error: "env.AI binding missing" };
    if (!Array.isArray(this.messages)) return { ok: false, error: "this.messages not initialized" };
    const workersai = createWorkersAI({ binding: env.AI });
    const probe = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      prompt: "__probe__",
      abortSignal: AbortSignal.timeout(0),
    });
    if (typeof probe.toUIMessageStreamResponse !== "function") {
      return { ok: false, error: "toUIMessageStreamResponse not a function — ai-sdk mismatch" };
    }
    return { ok: true };
  } catch (e: any) {
    if (e?.name === "AbortError" || e?.message?.includes("aborted")) return { ok: true };
    return { ok: false, error: e.message };
  }
}
```

Then in `healthProbe()`:
```typescript
const streamCheck = await this.verifyChatFormat();
capabilities.push(streamCheck.ok ? "assistant_ui_stream_compatible" : `stream_error:${streamCheck.error}`);
```

### A4 — CloudflareAgent new `@callable()` methods

- `analyzeBindingNeeds(specs: DesignSpecs): Promise<{ bindingDefinitions: BindingDef[] }>` — AI call with skills `['cloudflare-docs', 'workers-architecture', 'binding-provisioning']`, Zod schema for output. May use the existing Cloudflare Docs MCP tools.
- `provisionBindings(defs: BindingDef[]): Promise<{ wranglerConfigFragment: string }>` — generates wrangler.jsonc snippet only. **Do NOT call the Cloudflare API to mutate real resources.** (See PRD Open Question #2.)
- `validateImplementation(code: string, bindingConfig: string): Promise<{ ok: boolean; violations: Violation[]; suggestions: string[] }>` — AI call with Zod schema.

### A5 — WorkshopAgent orchestration

```typescript
@callable()
async runWorkshop(brief: string, options?: { maxIterations?: number }) {
  await this.ensureReady();
  const design = this.env.DESIGN_AGENT.getByName('default');
  const cf = this.env.CLOUDFLARE_AGENT.getByName('default');
  const eng = this.env.ENGINEER_AGENT.getByName('default');
  const guard = this.env.GUARDRAIL_AGENT.getByName('default');

  const plan = await this.ai.generateStructuredResponse(brief, systemPrompt, {
    skills: this.skills, // includes 'jules-stitch-loop'
  });

  const maxIter = options?.maxIterations ?? 3;
  for (let i = 0; i < maxIter; i++) {
    const designSpecs = await design.runStitch(brief);
    const bindingDefs = await cf.analyzeBindingNeeds(designSpecs);
    const { wranglerConfigFragment } = await cf.provisionBindings(bindingDefs);

    const impl = await this.keepAliveWhile(() =>
      eng.overseeJules(plan.sessionId, { designSpecs, bindingConfig: wranglerConfigFragment })
    );

    const review = await guard.reviewImplementation(impl.prUrl);
    if (review.approved && impl.wranglerUpdated) return { status: 'done', prUrl: impl.prUrl };

    await this.store.patch({ lastReview: review, iteration: i + 1 });
  }
  return { status: 'max-iter-exhausted' };
}
```

### I1 — `thread_participants` schema

```typescript
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { threads } from "./threads";

export const threadParticipants = sqliteTable("thread_participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(),
  role: text("role", { enum: ["host", "participant", "user"] }).notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  leftAt: integer("left_at", { mode: "timestamp" }),
}, (t) => ({
  byThreadAgent: uniqueIndex("thread_participants_thread_agent_idx").on(t.threadId, t.agentName),
  byAgent: index("thread_participants_agent_idx").on(t.agentName),
}));
```

### I3 — Webhook HITL conversion

```typescript
// BEFORE (current):
await env.ENGINEER_AGENT.getByName('default').assignSprint(sprint);

// AFTER:
const hitlId = await hitlQueue.propose({
  category: 'webhook.assign_sprint',
  entityId: sprint.id,
  proposedPayload: sprint,
  contextMetadata: { source: 'github-webhook', eventType }
});
return c.json({ status: 'pending_approval', hitlId }, 202);
```

### I6 — Stale binding mapping

| Old | New | Method |
|-----|-----|--------|
| GEMINI_AGENT | ORCHESTRATOR_AGENT | `.chat()` |
| CLOUDFLARE_DOCS_AGENT | CLOUDFLARE_AGENT | `.chat()` |
| DEEP_RESEARCH_CHAT_AGENT | RESEARCH_AGENT | `.deepDive()` |
| SUPERVISOR | ORCHESTRATOR_AGENT | `.healthProbe()` |
| WEB_SEARCH_AGENT | RESEARCH_AGENT | `.puppeteerSearch()` or `.research()` |
| JUDGE_AGENT | GUARDRAIL_AGENT | `.judgeCodeQuality()` or `.evaluatePayload()` |
| TOPIC_ORCHESTRATOR | RESEARCH_AGENT | `.topicResearch()` |
| JULES_OVERSEER | ENGINEER_AGENT | `.checkSchedule()` / `.ingestEvent()` |

---

## Per-Task Checklist (apply as relevant)

```
[ ] Read TASKS.json entry
[ ] Grep for existing code that might collide
[ ] Make minimal diff
[ ] Run npx tsc --noEmit
[ ] Re-read success_criteria and verify each
[ ] Commit with task ID in message
```

---

## Verification Commands

```bash
# Every task:
npx tsc --noEmit

# After I8:
npx wrangler types
npx wrangler deploy --dry-run

# After I6:
grep -rE "GEMINI_AGENT|DEEP_RESEARCH_CHAT_AGENT|SUPERVISOR|WEB_SEARCH_AGENT|JUDGE_AGENT|TOPIC_ORCHESTRATOR|JULES_OVERSEER|CLOUDFLARE_DOCS_AGENT" src/backend/src/routes src/backend/src/workflows
# → zero matches

# After I5:
grep -rn "\.fetch(new Request(" src/backend/src/routes
# → zero matches (or only annotated SSE exceptions)

# After C4:
grep -rn "buildSkillContext\|skill-fetcher\|fetchRemoteSkill" src/
# → zero matches

# After I7:
ls src/backend/src/routes/api/*.ts
# → only auth.ts, index.ts, hitl.ts

# After I1:
pnpm run migrate:local

# After I4:
curl /health | jq '.checks[] | select(.name | startswith("agent:"))'
# → entry per bound agent with skills_configured count + isFrontendFacing

# After I3 + I2:
# POST test webhook → 202 with hitlId
# POST /api/hitl/<id>/approve → 200, deferred action dispatched

# After I10:
# Start a collaboration session, post 3 messages
# SELECT * FROM threads WHERE hostAgentId='CollaborationSpace' → 1 row
# SELECT * FROM thread_participants WHERE threadId=<id> → participant rows
# SELECT * FROM messages WHERE threadId=<id> → 3 rows
```

---

## Open Questions — Resolve Before Starting

The PRD has four open questions that affect implementation details. Read them and confirm answers before writing code:

1. **LearningAgent base class (A8)** — does it have a chat surface in assistant-ui?
2. **CloudflareAgent `provisionBindings()` (A4)** — config-fragment only, or live CF API provisioning?
3. **Wrangler reset (I8)** — running against production DB or dev/preview only?
4. **OverseerAgent delete (C1)** — confirm order: after wrangler reset.

If you cannot resolve a question, default to the safer choice documented in the PRD and note the assumption in the commit message.

---

## Final Note

The goal is a clean, standardized, production-ready backend. The heavy lifting is done — this PR closes the gaps. Be precise, grep before you delete, and commit early and often. Do not introduce anything not in the TASKS.json.
