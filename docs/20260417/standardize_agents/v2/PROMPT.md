# Coding Agent Prompt — Standardize Agents v2

**Read this entire document before writing a single line of code.**

**Architecture reference:** `docs/20260417/standardize_agents/v2/PLAN.md`  
**Task list:** `docs/20260417/standardize_agents/v2/TASKS.md`  
**This v2 supersedes v1** — if you have read v1, discard it and use only v2.

---

## Context

You are refactoring the Cloudflare Agents SDK backend in `src/backend/src/ai/`. The goal is a single, consistent agent standard across all 10 agents — unified base classes, centralized AI via `AIProvider`, D1-backed skills, collaborative sessions, human-in-the-loop webhooks, and comprehensive health checks.

Two prior AI models (Claude v1 and Gemini v1) each produced implementation plans. V2 synthesizes both, corrects errors in both, and is grounded in the Cloudflare Agents SDK documentation. **Trust v2 over anything you may have seen in v1 documents.**

---

## Non-Negotiable Rules

1. **Execute TASKS.md phases in order.** Do not start Phase 2 until Phase 1 compiles. Do not start Phase 3 until Phase 2 compiles. Run `npx tsc --noEmit` before committing each phase.

2. **Never change `@callable()` method signatures.** Routes, Workflow entrypoints, and frontend hooks depend on these. The internal implementation can change, but the public signature must stay identical.

3. **Never delete a file without first grepping for imports.** Use `grep -r "filename" src/` before deletion. Confirm zero results.

4. **`agentInit()` must preserve all existing agent-specific logic** from the current `onStart()`. The refactor removes boilerplate init (AIProvider, Logger, StateStore) — but DDL migrations, cache warm-start, state recovery — these stay in `agentInit()`.

5. **Long-running operations in `BaseAgent` subclasses must use `this.keepAliveWhile(async () => { ... })`** for any operation exceeding ~60 seconds. Durable Objects are evicted after ~70–140s of inactivity. This is critical for EngineerAgent (Jules sessions) and ResearchAgent methods (if running as backend).

6. **Commit after each phase** with a descriptive message. Do not batch all phases into one commit.

---

## Critical Technical Constraints (Grounded in Cloudflare Docs)

These are facts from Cloudflare's documentation that override anything you may have assumed:

### Import Paths — Get These Right

```typescript
// CORRECT:
import { Agent, callable } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";  // NOT from "agents"
import { streamText, generateText, generateObject, convertToModelMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";

// WRONG (Gemini v1 error):
import { AIChatAgent } from "agents";  // ❌ — this will fail at runtime
```

### AIChatAgent: The Correct Override Hook

```typescript
// CORRECT — this is the chat message hook:
async onChatMessage(onFinish: (messages: any[]) => void) {
  const result = streamText({ ... });
  return result.toUIMessageStreamResponse(); // MUST return this type
}

// WRONG — these are different hooks:
async onMessage(connection, message) { ... }  // ❌ raw WebSocket
async onRequest(request) { ... }              // ❌ HTTP only
```

### AgentStateStore Constructor — Object Param, Not Positional

```typescript
// CORRECT:
this.store = new AgentStateStore({
  ctx: this.ctx,
  env: this.env as any,
  agentName: this.agentName,
  initialState: { status: "idle", history: [] },
});

// WRONG (Gemini v1 error):
this.store = new AgentStateStore(this.ctx, this.env, this.agentName);  // ❌
```

### Jules Step 2: Use the Right Model

```typescript
// CORRECT — STRUCTURING_MODEL from vendors/worker-ai.ts:
const STRUCTURING_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// WRONG (Gemini v1 error — weaker model):
"@cf/meta/llama-3.1-8b-instruct"  // ❌ for step 2 — use the structuring model
```

### Workers AI Structured Output via Vercel AI SDK

```typescript
// CORRECT — Workers AI natively supports generateObject with Zod:
const { object } = await generateObject({
  model: createWorkersAI({ binding: env.AI })("@cf/meta/llama-4-scout-17b-16e-instruct"),
  schema: MyZodSchema,  // Zod schema — SDK handles response_format internally
  prompt: "...",
});
```

### keepAliveWhile for Long Operations

```typescript
// In any BaseAgent method that takes >60s:
const result = await this.keepAliveWhile(async () => {
  return await longRunningJulesSession(prompt);
});
// keepAliveWhile creates an alarm heartbeat that prevents DO eviction
```

### getAgentByName Signature

```typescript
// Correct — takes the DO namespace binding from env, not env itself:
const stub = await getAgentByName<Env>(env.COLLABORATION_SPACE, sessionId);
await stub.postMessage("EngineerAgent", "Jules task dispatched");
```

---

## Agent Taxonomy — This Is the Architecture

```
Frontend Chat (BaseChatAgent ← AIChatAgent from @cloudflare/ai-chat):
  OrchestratorAgent    — users chat about project status, task steering
  ResearchAgent        — users chat about research, reports, analysis
  CloudflareAgent      — users chat about deployed workers, docs

Backend Task (BaseAgent ← Agent from agents):
  EngineerAgent        — Jules sessions, sprint execution
  GithubAgent          — webhook processing, PR review
  GuardrailAgent       — code validation, golden-path enforcement
  LearningAgent        — CI healing, HITL approval dispatch
  WorkshopAgent        — orchestration, spec generation
  DesignAgent          — Stitch UI pipeline
  OverseerAgent        — Jules session monitoring

Collaboration Infrastructure:
  CollaborationSpace   — silo'd DO workspace for agent-to-agent sessions
                         Extends BaseChatAgent (needs WebSocket for agent broadcast)
                         NOT for user chat — for agent-to-agent comms only
```

---

## Phase 0: What to Do Before Any Code

Run these greps. **Document the findings.** The migration in Phase 2 depends on knowing what each agent currently does.

```bash
# 1. Find hardcoded system prompts (to be moved to agent-config seed)
grep -rn "systemPrompt\s*=\|const.*Instructions\s*=\|const.*prompt.*=\s*\`" \
  src/backend/src/ai/agents/ --include="*.ts"

# 2. Find hardcoded provider/model strings
grep -rn "'gemini'\|'openai'\|'worker-ai'\|'workers-ai'\|'jules'\|@cf/\|gpt-\|gemini-" \
  src/backend/src/ai/agents/ --include="*.ts"

# 3. Find generateText calls that should be generateStructuredResponse
grep -rn "generateText\|generateChatText" src/backend/src/ai/agents/ --include="*.ts" | \
  grep -v "generateStructured"

# 4. Find all buildSkillContext usages
grep -rn "buildSkillContext\|skill-fetcher" src/backend/src/ --include="*.ts"

# 5. Find all custom onStart() bodies to preserve in agentInit()
grep -A 20 "async onStart" src/backend/src/ai/agents/*/index.ts
```

---

## Phase 1: Building the Foundation

### New files to create (in order of dependencies)

**1. `ai/providers/types.ts`** — Add `skills?: string[]` to `AIOptions`

**2. `ai/providers/agent-support/skills.ts`** — `SkillManager`:
- Reads `agent_skills` D1 table (schema: `db/schemas/agents/skills.ts`)
- Returns `<skill_context>...</skill_context>` string
- Returns `""` for empty array or DB error (non-fatal)

**3. `ai/providers/methods/generation.ts`** — Skill injection in all 6 `*Impl` functions:
```typescript
// Add at top of each impl function, BEFORE provider dispatch:
if (options?.skills?.length) {
  const sm = new SkillManager(ai.env);
  const ctx = await sm.getSkillInstructions(options.skills);
  if (ctx) systemPrompt = `${systemPrompt ?? ""}\n\n${ctx}`.trim();
}
```

**4. `ai/providers/vendors/jules.ts`** — Formalize two-step. See PLAN.md §4.2 for complete implementation. Step 2 MUST use `STRUCTURING_MODEL`.

**5. `ai/providers/agent-support/health-base.ts`** — `AgentHealthService.baseChecks()`. All checks non-fatal. Returns structured result.

**6. `ai/providers/agent-support/hitl-queue.ts`** + schema + migration

**7. `ai/providers/agent-support/collaboration.ts`** + schema + migration

**8. `ai/providers/agent-support/base-agent.ts`** — See PLAN.md §3.1. Stub `hitl` and `collab` as `// TODO` if their files aren't done yet.

**9. `ai/providers/agent-support/base-chat-agent.ts`** — See PLAN.md §3.2. The `verifyChatFormat()` must be a real implementation, not `return true`. See PLAN.md §3.2 for the concrete implementation.

**10. `ai/providers/agent-support/state-store.ts`** — Add D1 mirror. `agentStateMirror` table already exists — import from `db/schemas/agents/mirror.ts`.

**11. Barrel exports** — Update `agent-support/index.ts` and `providers/index.ts`.

**12. `db/services/agent-config/seed.ts`** — Add missing entries from Phase 0 audit.

---

## Phase 2: Agent Migration Pattern

Every agent follows this exact pattern. No exceptions.

```typescript
// ─────────────────────────────────────────────
// BEFORE (example):
// ─────────────────────────────────────────────
export class MyAgent extends AIChatAgent<Env, MyState> {
  public ai!: AIProvider;
  private logger!: Logger;

  async onStart() {
    this.ai = new AIProvider(this.env);
    this.logger = new Logger(this.env, "MyAgent");
    // ... agent-specific DDL, cache warm, etc.
  }

  @callable()
  async healthProbe() { return { status: "ok", agent: "MyAgent" }; }

  @callable()
  async ping() { return "pong"; }

  async someMethod(input: string) {
    const skills = await buildSkillContext(this.env, "MyAgent");
    const result = await this.ai.generateText(
      prompt,
      `SYSTEM INSTRUCTIONS...\n${skills}`,
      { provider: "gemini", model: "gemini-2.5-flash" }
    );
  }
}

// ─────────────────────────────────────────────
// AFTER (example — frontend agent):
// ─────────────────────────────────────────────
export class MyAgent extends BaseChatAgent {
  readonly agentName = "MyAgent";
  protected readonly skills = ["skill-a", "skill-b"];

  // ONLY agent-specific init here — AIProvider, Logger, StateStore are inherited
  protected async agentInit() {
    // Preserve: DDL migrations, cache warm-start, state recovery
    // Remove: this.ai = ..., this.logger = ..., this.store = ...
  }

  // healthProbe() and ping() are INHERITED — do NOT add them

  // Agent-specific health checks only
  protected async agentHealth() {
    return ["check-a:ok", "check-b:ok"];
  }

  async someMethod(input: string) {
    const config = await this.ai.getAgentFunctionConfig(this.agentName, "someMethod");
    const result = await this.ai.generateStructuredResponse(
      prompt,
      MySchema,
      config.systemInstructions,
      {
        provider: config.primaryProvider,
        model: config.primaryModel,
        skills: this.skills,
      }
    );
  }
}
```

### CollaborationSpace (TASK-201) — Do This First

Before migrating any agents, create `CollaborationSpace`. It's needed by Phase 3 and other agents may reference it. Steps:
1. Create `ai/agents/CollaborationSpace/index.ts` from `ChatRoom/index.ts` contents
2. Rename class to `CollaborationSpace extends BaseChatAgent`
3. Add `@callable()` methods: `openSession`, `addCollaborator`, `postMessage`, `triggerCollaborator`, `getEvents`, `closeSession`
4. Update `exports.ts`
5. Grep for all imports of `ChatRoom` and update to `CollaborationSpace`
6. Delete root `ChatRoom.ts` (only after confirming zero imports)

### EngineerAgent — keepAliveWhile Required

EngineerAgent runs Jules sessions that can take 5–20+ minutes. Without `keepAliveWhile`, the DO is evicted and the session orphaned. Every Jules operation must be wrapped:

```typescript
// In EngineerAgent methods:
const result = await this.keepAliveWhile(async () => {
  return await this.ai.completeTask(repoUrl, issueId);
});
```

---

## Phase 3: Integration

### Webhook HITL (TASK-301)

Replace every auto-trigger pattern in `routes/api/webhooks/index.ts`:

```typescript
// Pattern to replace:
if (event === "pull_request" && action === "opened") {
  await someAgent.doSomething(payload);
}

// Replacement:
const hitl = new HitlQueue(env);
const hitlId = await hitl.propose({
  type: `webhook:pull_request:${payload.action}`,
  proposedAction: `Review PR #${payload.pull_request.number} in ${payload.repository.full_name}`,
  proposedMarkdown: buildPrProposalMarkdown(payload),
  payload,
  repoOwner: payload.repository.owner.login,
  repoName: payload.repository.name,
});
return c.json({ status: "queued", hitlId }, 202);
```

The existing `delivery_id` deduplication check (already in the webhook handler) prevents duplicate proposals when GitHub retries.

Add `routes/api/hitl.ts` with four endpoints. Wire into main Hono app router.

### Health Coordinator (TASK-302)

In `health/coordinator.ts`, add agent checks using the existing per-check timeout wrapper. The `isFrontendFacing` flag from `healthProbe()` response is used to determine if `assistant_ui_stream_compatible` is required.

---

## Verification — Run This After Phase 3

```bash
# Compilation
cd src/backend && npx tsc --noEmit

# Deployment dry-run
cd ../.. && pnpm run dry-run

# Health endpoint (requires deployed worker or local dev)
curl http://localhost:8787/health | jq '.checks | map(select(.name | startswith("agent:")))'

# Expected for frontend agents:
# { name: "agent:OrchestratorAgent", status: "ok", detail: ["assistant_ui_stream_compatible", ...] }

# Expected for backend agents:
# { name: "agent:EngineerAgent", status: "ok", detail: ["bindings_ok", "state_store_mirrored", ...] }
```

Manual checks:
1. Chat with OrchestratorAgent from assistant-ui → streaming works, no spinner
2. Send a GitHub PR webhook → Worker returns 202, D1 has pending hitl_proposals row
3. Approve HITL via `POST /api/hitl/:id/approve` → D1 hitl_decisions row + action fires
4. Trigger `EngineerAgent` Jules session RPC → Jules runs, keepAliveWhile prevents eviction

---

## Files Reference Table

| File | Action | Notes |
|------|--------|-------|
| `ai/providers/types.ts` | MODIFY | Add `skills?: string[]` |
| `ai/providers/methods/generation.ts` | MODIFY | Skill injection in 6 functions |
| `ai/providers/vendors/jules.ts` | MODIFY | Formalize two-step |
| `ai/providers/agent-support/skills.ts` | NEW | SkillManager |
| `ai/providers/agent-support/base-agent.ts` | NEW | BaseAgent abstract |
| `ai/providers/agent-support/base-chat-agent.ts` | NEW | BaseChatAgent abstract |
| `ai/providers/agent-support/health-base.ts` | NEW | AgentHealthService |
| `ai/providers/agent-support/hitl-queue.ts` | NEW | HitlQueue service |
| `ai/providers/agent-support/collaboration.ts` | NEW | CollaborationService |
| `ai/providers/agent-support/state-store.ts` | MODIFY | D1 mirror on write |
| `ai/providers/agent-support/index.ts` | MODIFY | Barrel exports |
| `ai/providers/index.ts` | MODIFY | Re-export base classes |
| `ai/agents/CollaborationSpace/index.ts` | NEW | From ChatRoom/ |
| `ai/agents/OrchestratorAgent/index.ts` + methods | MODIFY | → BaseChatAgent |
| `ai/agents/ResearchAgent/index.ts` + methods | MODIFY | → BaseChatAgent |
| `ai/agents/CloudflareAgent/index.ts` + methods | MODIFY | → BaseChatAgent |
| `ai/agents/EngineerAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/GithubAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/GuardrailAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/LearningAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/WorkshopAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/DesignAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/OverseerAgent/index.ts` + methods | MODIFY | → BaseAgent |
| `ai/agents/exports.ts` | MODIFY | CollaborationSpace reference |
| `ai/agents/ChatRoom.ts` | **DELETE** | Confirm zero imports first |
| `services/octokit/skill-fetcher.ts` | **DELETE** | Confirm zero imports first |
| `db/schemas/agents/hitl.ts` | NEW | HITL D1 schema |
| `db/schemas/agents/collaborations.ts` | NEW | Collaboration D1 schema |
| `db/schemas/agents/mirror.ts` | NO CHANGE | agentStateMirror already exists |
| `db/services/agent-config/seed.ts` | MODIFY | Add missing entries |
| `routes/api/webhooks/index.ts` | MODIFY | HITL propose instead of auto-trigger |
| `routes/api/hitl.ts` | NEW | HITL API endpoints |
| `health/coordinator.ts` | MODIFY | Per-agent health checks |
| `wrangler.jsonc` | MODIFY | Add COLLABORATION_SPACE binding |
