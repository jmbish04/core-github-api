# Standardize Agents — Architecture Plan v4

**Date:** 2026-04-17  
**Supersedes:** `docs/20260417/standardize_agents/v3/PLAN.md`  
**Integrates:** `docs/20260414/agents_audit/checkin_1/v1/plan.md`  
**Scope:** (1) Build BaseAgent/BaseChatAgent infrastructure, (2) Conform all agents to it, (3) Complete audit cleanup — route migration, anti-pattern fixes, unified chat schema, wrangler reset, route modularization.

---

## What Changed from v3

v3 focused exclusively on building the infrastructure and migrating agents. v4 additionally integrates the agents_audit plan (Scopes A–E), which covers cleanup work that was done AFTER the initial agent consolidation (Phase 1, now complete):

| Added from Audit Plan | Type | When |
|-----------------------|------|------|
| Delete 4 legacy flat agent files | Cleanup | Phase 2 (parallel with foundation) |
| Create GithubAgent/methods/repo.ts | Missing file | Phase 2 |
| Dissolve OverseerAgent → EngineerAgent + GuardrailAgent | Structural | Phase 2 (removes it from migration list) |
| Fix 16 stale route binding references | Route fix | Phase 4 |
| Fix 7 anti-pattern `agent.fetch(new Request(...))` calls | Anti-pattern | Phase 4 |
| Add 3 missing `@callable()` methods | Missing methods | Phase 4 |
| Move 12 loose route files to category dirs | Organization | Phase 4 |
| Unified chat schema (threads/messages/participants) | D1 schema | Phase 4 |
| Chat route migration to unified schema | Route fix | Phase 5 |
| Wrangler fresh v1 migration reset (6 tags → 1) | Deployment | Phase 4 |
| Export alignment fixes (LearningWorkflow etc.) | Build fix | Phase 4 |
| Delete legacy exports + todo_integration/ | Cleanup | Phase 4 |

**OverseerAgent disposition (v3 had it as BaseAgent candidate — v4 dissolves it):**
- Jules oversight → `EngineerAgent/methods/oversee-jules.ts` (already exists)
- Payload validation / Judge → `GuardrailAgent/methods/evaluate.ts` + `judge.ts` (already exists)
- OverseerAgent directory deleted in Phase 4 after wrangler reset

---

## Non-Negotiable Technical Constraints

These are the same as v3 — repeated here as a hard reference:

### 1. AIChatAgent import path
```typescript
// CORRECT — backend agent classes:
import { Agent, AIChatAgent, callable } from "agents";

// WRONG — frontend-only package:
import { AIChatAgent } from "@cloudflare/ai-chat"; // ← React hook package only
```

### 2. No live inference in health probes
`verifyChatFormat()` must use **static checks only**. No `generateText()`, no `streamText()`, no `fetch()` to AI endpoints. Use `AbortSignal.timeout(0)` to verify return type shape without inference.

### 3. HITL schema path
`db/schemas/workflows/hitl.ts` — **already exists**. Do NOT create `db/schemas/agents/hitl.ts`.

### 4. Jules step-2 system prompt from D1
```typescript
const config = await aiProvider.getAgentFunctionConfig(agentName, functionName);
const sys = config?.systemInstructions ?? "Extract into JSON schema. Output only valid JSON.";
```

### 5. AgentStateStore object constructor
```typescript
new AgentStateStore({ ctx: this.ctx, env, agentName: this.agentName, initialState: {} });
```

### 6. AIChatAgent message hook name
`onChatMessage(onFinish)` — not `onMessage()`.

### 7. Long tasks need keepAliveWhile()
Any Jules session, research pipeline, or multi-step workflow must wrap with `this.keepAliveWhile(async () => { ... })`.

### 8. @callable() signatures are immutable
Never rename or change parameter types on any `@callable()` method — routes, Workflows, and frontend hooks depend on them.

### 9. Never agent.fetch(new Request(...))
All agent-to-agent calls must use `@callable()` RPC. Exception: SSE streaming where RPC can't return a stream — must be documented with a comment explaining why `onRequest` is the intentional fallback.

### 10. All AI calls through ai/providers
No direct vendor imports in agent files (`openai`, `@google/generative-ai`, etc.). Always use `this.ai.*`.

---

## Agent Taxonomy (Final)

### Frontend Chat Agents → `BaseChatAgent`
| Agent | Directory | Skills |
|-------|-----------|--------|
| OrchestratorAgent | `ai/agents/OrchestratorAgent/` | `plan-writing`, `architecture`, `task-management` |
| ResearchAgent | `ai/agents/ResearchAgent/` | `deep-research`, `brainstorming`, `source-evaluation` |
| CloudflareAgent | `ai/agents/CloudflareAgent/` | `cloudflare-docs`, `workers-architecture`, `debugging` |

### Backend Task Agents → `BaseAgent`
| Agent | Directory | Key Notes |
|-------|-----------|-----------|
| EngineerAgent | `ai/agents/EngineerAgent/` | Jules oversight absorbed from OverseerAgent; `keepAliveWhile()` |
| GithubAgent | `ai/agents/GithubAgent/` | Needs repo.ts created (task A2) |
| GuardrailAgent | `ai/agents/GuardrailAgent/` | Judge + evaluate absorbed from OverseerAgent |
| LearningAgent | `ai/agents/LearningAgent/` | Add `diagnose()` @callable |
| WorkshopAgent | `ai/agents/WorkshopAgent/` | Clean up legacy flat files first (task A1) |
| DesignAgent | `ai/agents/DesignAgent/` | Add `stream()` or document onRequest exception |

### CollaborationSpace → `BaseChatAgent`
Repurposed from `ChatRoom/index.ts`. WebSocket-based agent-to-agent silo. Not directly chat-facing for users.

### Dissolved Agent
| Agent | Status | Absorbed Into |
|-------|--------|--------------|
| OverseerAgent | **DISSOLVED** | EngineerAgent (`oversee-jules.ts`), GuardrailAgent (`evaluate.ts`, `judge.ts`) |

### Infrastructure DOs (Not migrated to BaseAgent — separate DO classes)
`JulesWebhookBroadcaster`, `PlanningMonitor`, `ReverseEngineeringMonitor`, `AgentSessionDO`, `RoomDO`, `Sandbox`

---

## Phase 0: Audit (Read-Only)

Grep every agent method file before writing code. Document:
1. Hardcoded `systemPrompt` strings → need `seed.ts` entries
2. Hardcoded provider/model strings → need `seed.ts` entries
3. `generateText()` calls that expect JSON → convert to `generateStructuredResponse`
4. All `buildSkillContext()` call sites → replaced in Phase 3
5. All agents with custom `onStart()` logic → preserved in `agentInit()`

---

## Phase 1: Foundation (ai/providers layer)

Build the full BaseAgent/BaseChatAgent infrastructure. Nothing in Phase 1 touches agent files directly.

### 1.1 `BaseAgent` (`agent-support/base-agent.ts`)

```typescript
import { Agent, callable } from "agents";
import { AIProvider } from "../index";
import { AgentStateStore } from "./state-store";
import { EdigraphService } from "./edigraph-memory";
import { Logger } from "../../lib/logger";
import { HitlQueue } from "./hitl-queue";
import { CollaborationService } from "./collaboration";

export abstract class BaseAgent<Env extends object = object> extends Agent<Env> {
  abstract readonly agentName: string;

  public ai!: AIProvider;
  public logger!: Logger;
  public store!: AgentStateStore;
  public hitl!: HitlQueue;
  public collab!: CollaborationService;
  public memory?: EdigraphService;

  protected readonly skills: string[] = [];
  protected agentInit?(): Promise<void>;
  protected agentHealth?(): Promise<string[]>;

  async onStart() {
    const env = this.env as any;
    this.logger = new Logger(env, this.agentName);
    this.ai = new AIProvider(env);
    this.store = new AgentStateStore({
      ctx: this.ctx, env,
      agentName: this.agentName,
      initialState: { status: "idle", history: [] },
    });
    this.hitl = new HitlQueue(env);
    this.collab = new CollaborationService(env);
    if (env.EDGRAPH) {
      this.memory = new EdigraphService(env.EDGRAPH, this.ctx.id.toString());
    }
    await this.agentInit?.();
    this.logger.info(`${this.agentName} initialized`);
  }

  protected async ensureReady() {
    if (!this.ai) await this.onStart();
  }

  @callable()
  async ping() {
    return { status: "pong", agent: this.agentName, ts: Date.now() };
  }

  @callable()
  async healthProbe() {
    await this.ensureReady();
    const capabilities: string[] = ["bindings_ok", "state_store_mirrored"];
    let status = "ok";
    try {
      if (this.agentHealth) capabilities.push(...(await this.agentHealth()));
    } catch (e: any) {
      status = "degraded";
      this.logger.error("Health check failed", e);
      capabilities.push(`error:${e.message}`);
    }
    return { agent: this.agentName, status, timestamp: Date.now(), capabilities, isFrontendFacing: false };
  }
}
```

### 1.2 `BaseChatAgent` (`agent-support/base-chat-agent.ts`)

```typescript
import { AIChatAgent } from "agents";  // ← BACKEND class from "agents" — NOT "@cloudflare/ai-chat"
import { streamText, convertToModelMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";
// ... same infrastructure imports as BaseAgent ...

export abstract class BaseChatAgent<Env extends object = object> extends AIChatAgent<Env> {
  abstract readonly agentName: string;
  protected readonly skills: string[] = [];
  public ai!: AIProvider;
  public logger!: Logger;
  public store!: AgentStateStore;
  public hitl!: HitlQueue;
  public collab!: CollaborationService;
  public memory?: EdigraphService;
  protected agentInit?(): Promise<void>;
  protected agentHealth?(): Promise<string[]>;

  async onStart() { /* same initialization as BaseAgent */ }
  protected async ensureReady() { if (!this.ai) await this.onStart(); }

  // Subclasses override this with their own model config
  async onChatMessage(onFinish: (messages: any[]) => void) {
    await this.ensureReady();
    const config = await this.ai.getAgentFunctionConfig(this.agentName, "onChatMessage");
    const workersai = createWorkersAI({ binding: (this.env as any).AI });
    const result = streamText({
      model: workersai(config?.primaryModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: config?.systemInstructions,
      messages: await convertToModelMessages(this.messages),
      onFinish: ({ response }) => onFinish(response.messages),
    });
    return result.toUIMessageStreamResponse();
  }

  @callable() async ping() { return { status: "pong", agent: this.agentName, ts: Date.now() }; }

  @callable()
  async healthProbe() {
    await this.ensureReady();
    const capabilities = ["bindings_ok", "state_store_mirrored", "websocket_hibernation_ready"];
    let status = "ok";

    // Static checks ONLY — no live inference (prevents rate limit cascade on parallel health calls)
    const streamCheck = await this.verifyChatFormat();
    if (!streamCheck.ok) { status = "degraded"; capabilities.push(`stream_error:${streamCheck.error}`); }
    else capabilities.push("assistant_ui_stream_compatible");

    try {
      if (this.agentHealth) capabilities.push(...(await this.agentHealth()));
    } catch (e: any) { status = "degraded"; capabilities.push(`error:${e.message}`); }

    return { agent: this.agentName, status, timestamp: Date.now(), capabilities, isFrontendFacing: true };
  }

  // Static shape-check ONLY — AbortSignal.timeout(0) immediately cancels any network attempt
  private async verifyChatFormat(): Promise<{ ok: boolean; error?: string }> {
    try {
      const env = this.env as any;
      if (!env.AI) return { ok: false, error: "env.AI binding missing" };
      if (!Array.isArray(this.messages)) return { ok: false, error: "this.messages not initialized" };
      const workersai = createWorkersAI({ binding: env.AI });
      const probe = streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
        prompt: "__probe__",
        abortSignal: AbortSignal.timeout(0),  // cancels immediately — only checks return shape
      });
      if (typeof probe.toUIMessageStreamResponse !== "function") {
        return { ok: false, error: "toUIMessageStreamResponse not a function — ai-sdk version mismatch" };
      }
      return { ok: true };
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.message?.includes("aborted")) return { ok: true };
      return { ok: false, error: e.message };
    }
  }
}
```

### 1.3 SkillManager (`agent-support/skills.ts`)

Reads from existing `agent_skills` D1 table. Returns `<skill_context>…</skill_context>` wrapped content. Non-fatal on D1 error. Injected in all 6 generation methods in `methods/generation.ts` via `options.skills?: string[]`.

### 1.4 Jules Two-Step (`vendors/jules.ts`)

Step 1: Jules generates text with schema description appended. Step 2: Workers AI `generateObject()` with `STRUCTURING_MODEL` (`@cf/meta/llama-4-scout-17b-16e-instruct`) structures Jules text into Zod schema. System prompt loaded from `getAgentFunctionConfig(agentName, functionName)` — never hardcoded. Jules step 1 failure falls back to Workers AI direct structuring.

### 1.5 AgentStateStore D1 Mirror (`agent-support/state-store.ts`)

Add `mirrorToD1()` called via `ctx.waitUntil()` in both `set()` and `patch()`. Uses existing `agentStateMirror` table from `db/schemas/agents/mirror.ts`. D1 failure never throws.

### 1.6 HitlQueue (`agent-support/hitl-queue.ts`)

Imports from `db/schemas/workflows/hitl.ts` (already exists). Methods: `propose()`, `approve()`, `reject()`, `iterate()`, `list()`, `get()`.

### 1.7 CollaborationService (`agent-support/collaboration.ts`)

Opens and interacts with CollaborationSpace DO instances via `getAgentByName(env.COLLABORATION_SPACE, sessionId)`. All operations mirror to D1 `collaboration_sessions` and `collaboration_events` (new schema file in `db/schemas/agents/collaborations.ts`).

---

## Phase 2: Pre-Migration Cleanup (Parallel with Phase 1)

These tasks have no dependency on the BaseAgent infrastructure. Run Phase 2 in parallel with Phase 1 or immediately after.

### A1. Delete 4 Legacy Flat Agent Files

Confirm zero import sites via grep before deleting:
- `ai/agents/ChatRoom.ts` → replaced by `ChatRoom/index.ts` (→ CollaborationSpace)
- `ai/agents/WorkshopAgent/CfAgentsSdk.ts` → replaced by `CloudflareAgent/methods/agents-sdk-expert.ts`
- `ai/agents/WorkshopAgent/UxResearcher.ts` → replaced by `DesignAgent/methods/ux-research.ts`
- `ai/agents/WorkshopAgent/WorkshopAgent.ts` → replaced by `WorkshopAgent/index.ts`

### A2. Create GithubAgent/methods/repo.ts

GithubAgent is missing its repo method file. Extract callable methods from `GithubAgent/todo_integration/Repo.ts`, adapt to Omni-Agent pattern (agent context as first param), add `@callable()` delegates in `GithubAgent/index.ts`.

### A3. Dissolve OverseerAgent

Verify that:
- `EngineerAgent/methods/oversee-jules.ts` has `checkSchedule()` and `ingestEvent()`
- `GuardrailAgent/methods/evaluate.ts` + `judge.ts` cover OverseerAgent validation

Then:
- Remove `OVERSEEER_AGENT` (typo) from `wrangler.jsonc` active bindings
- Remove OverseerAgent from `shared/health.ts` monitoring list
- Do NOT delete OverseerAgent directory yet (needed for wrangler migration tag — deleted in Phase 4 after wrangler reset)

### B1–B4. Unified Chat Schema (Parallel with A1–A3)

Extend `db/schemas/chats/` as the single source of truth for all chat data:

**B1.** Add to `threads.ts`: `hostAgentId` (text nullable), `roomId` (text nullable), `source` (enum: `user_chat|agent_orchestration|chatroom`), `userId` (text nullable). Add indexes: `threads_host_agent_idx`, `threads_source_idx`, `threads_user_idx`.

**B2.** Add to `messages.ts`: `metadata` (json nullable) — for tool results, evaluation scores, ChatRoom context.

**B3.** Create `participants.ts`: `thread_participants` table with composite PK `(threadId, agentName)`, `role` enum `host|participant|observer`, `joinedAt`. Index on `agentName`.

**B4.** Export chats schema from `db/schema.core.ts`. Run `npx drizzle-kit generate` to produce migration SQL. Run `pnpm run migrate:local` to test.

---

## Phase 3: Agent Migration

Depends on Phase 1 (foundation) + Phase 2 (cleanup). Migrate each canonical agent to the new base classes.

### Migration Pattern

```typescript
// BEFORE:
export class MyAgent extends AIChatAgent<Env> {
  public ai!: AIProvider;
  async onStart() { this.ai = new AIProvider(this.env); }
  @callable() async healthProbe() { return { status: 'ok' }; }
}

// AFTER:
export class MyAgent extends BaseChatAgent {  // or BaseAgent
  readonly agentName = 'MyAgent';
  protected readonly skills = ['skill-a', 'skill-b'];

  protected async agentInit() {
    // ONLY agent-specific init: DDL, cache warm, state recovery
  }
  // healthProbe() and ping() inherited — DO NOT duplicate
  protected async agentHealth() {
    return ['custom_check:ok'];
  }
}
```

### Per-Agent Changes (All)
1. Remove `import { AIProvider }` — inherited
2. Remove `import { Logger }` — inherited
3. Remove `this.ai = new AIProvider(...)` — inherited
4. Remove `this.logger = new Logger(...)` — inherited
5. Remove duplicate `healthProbe()` and `ping()` — inherited
6. Add `readonly agentName` and `protected readonly skills`
7. Rename `onStart()` → `agentInit()` (keep only agent-specific logic)
8. Replace all `buildSkillContext(env, agentName)` with `options: { skills: this.skills }`
9. Replace hardcoded `systemPrompt` strings with `await this.ai.getAgentFunctionConfig(this.agentName, 'methodName')`

### Agent-Specific Notes

**OrchestratorAgent** (BaseChatAgent) — `skills: ['plan-writing', 'architecture', 'task-management']`  
`agentHealth()`: ping each sibling agent binding via `getAgentByName(...).ping()`

**ResearchAgent** (BaseChatAgent) — `skills: ['deep-research', 'brainstorming', 'source-evaluation']`  
Replace all `buildSkillContext()` in method files too.

**CloudflareAgent** (BaseChatAgent) — `skills: ['cloudflare-docs', 'workers-architecture', 'debugging']`  
`agentHealth()`: verify `CLOUDFLARE_API_TOKEN` via lightweight `fetch` to `/v4/user/tokens/verify`.

**EngineerAgent** (BaseAgent) — absorbs Jules oversight from OverseerAgent  
Preserve DDL migration logic in `agentInit()`. Wrap Jules calls in `keepAliveWhile()`.

**GithubAgent** (BaseAgent) — repo.ts method file added in Phase 2 (A2)  
Preserve webhook dedup alarm logic in `agentInit()`.

**GuardrailAgent** (BaseAgent) — absorbs Judge + evaluate from OverseerAgent  
`agentHealth()`: verify D1 rule count + DO cache warmth.

**LearningAgent** (BaseAgent) — add `@callable() diagnose(errorInfo)` in Phase 4 (D2)

**WorkshopAgent** (BaseAgent) — flat files deleted in Phase 2 (A1). Preserve StateStore setup.

**DesignAgent** (BaseAgent) — add `@callable() stream(runId)` or document onRequest exception in Phase 4 (D2)

**CollaborationSpace** (BaseChatAgent) — refactored from `ChatRoom/index.ts`.  
Rename directory `ChatRoom/` → `CollaborationSpace/`. Implement 6 RPC methods: `openSession`, `addCollaborator`, `postMessage`, `triggerCollaborator`, `getEvents`, `closeSession`. Update `ai/agents/exports.ts`.

**OverseerAgent** — DO NOT MIGRATE. Mark dissolved. Delete directory in Phase 4 after wrangler reset.

---

## Phase 4: Integration, Routes, and Wrangler Reset

Depends on Phase 3 (agent migration complete).

### 4.1 Wrangler Fresh Migration Reset (E1–E3)

**E1.** Replace all 6 migration tags (v1–v6) in `wrangler.jsonc` with a single fresh `v1`:
```jsonc
"migrations": [{
  "tag": "v1",
  "new_sqlite_classes": [
    "OrchestratorAgent", "SoftwareEngineerAgent", "GuardrailAgent",
    "ResearchAgent", "GithubAgent", "CloudflareAgent", "DesignAgent",
    "ContinuousLearningAgent", "WorkshopAgent", "CollaborationSpace",
    "Sandbox", "JulesWebhookBroadcaster", "PlanningMonitor",
    "ReverseEngineeringMonitor", "AgentSessionDO", "RoomDO"
  ]
}]
```
Note: `ChatRoom` → `CollaborationSpace` (renamed in Phase 3).

**E2.** Fix export alignment:
- Add `LearningWorkflow` export to `workflows/exports.ts` (bound in wrangler but not exported)
- Decide on `HitlWorkflow`: add wrangler binding or remove export
- Verify aliases: `EngineerAgent as SoftwareEngineerAgent`, `StitchDesignAgent as DesignAgent`

**E3.** With fresh v1 in place:
- Delete the "Legacy class exports (MIGRATION ONLY)" section from `ai/agents/exports.ts`
- Delete all `todo_integration/` directories (28 files across 9 agents)
- Delete `OverseerAgent/` directory entirely

### 4.2 Fix 16 Stale Route References (A4)

| File | Old Binding | New Binding | New Method |
|------|-------------|-------------|------------|
| `routes/api/agents/chat.ts:55` | `GEMINI_AGENT` | `ORCHESTRATOR` | `.chat()` |
| `routes/api/agents/deep-research-chat.ts:81` | `DEEP_RESEARCH_CHAT_AGENT` | `RESEARCH_AGENT` | `.deepDive()` |
| `routes/api/frontend/ai/chat.ts:177` | `CLOUDFLARE_DOCS_AGENT` | `CLOUDFLARE_AGENT` | `.chat()` |
| `routes/api/frontend/ai/chat.ts:187,194` | `GEMINI_AGENT` | `ORCHESTRATOR` | `.chat()` |
| `routes/api/ops/ops.ts:93,100,107` | `SUPERVISOR` | `ORCHESTRATOR` | `.healthProbe()` |
| `workflows/research/topic.ts:23` | `WEB_SEARCH_AGENT` | `RESEARCH_AGENT` | `.puppeteerSearch()` |
| `workflows/research/topic.ts:39` | `JUDGE_AGENT` | `GUARDRAIL_AGENT` | `.judgeCodeQuality()` |
| `routes/api/projects/sentinel/mcp.ts:207` | `JUDGE_AGENT` | `GUARDRAIL_AGENT` | `.judgeCodeQuality()` |
| `routes/api/projects/sentinel/submit.ts:81-96` | `JUDGE_AGENT` | `GUARDRAIL_AGENT` | `.judgeCodeQuality()` |
| `routes/api/frontend/research/research.ts:25-26` | `TOPIC_ORCHESTRATOR` | `RESEARCH_AGENT` | `.topicResearch()` |
| `routes/api/projects/sentinel/clarify.ts:50` | `JULES_OVERSEER` | `ENGINEER_AGENT` | `.overseeJules()` |

If the target agent doesn't have the required `@callable()` method, add a compatibility shim.

### 4.3 Fix 7 Anti-Pattern `agent.fetch(new Request(...))` Calls (D1)

| File | Line | Fix |
|------|------|-----|
| `routes/api/ux/index.ts` | 79 | DESIGN_AGENT: `agent.stream(runId)` via `@callable()` or WebSocket (document if onRequest needed) |
| `routes/api/webhooks/jules.ts` | 96 | JULES_WEBHOOK_BROADCASTER: `agent.broadcast(payload)` |
| `routes/api/webhooks/jules.ts` | 191 | JULES_OVERSEER → ENGINEER_AGENT: `agent.checkSchedule()` |
| `routes/api/ops/health.ts` | 69 | LEARNING_AGENT: `agent.diagnose(errorInfo)` |
| `routes/api/projects/sentinel/broadcast.ts` | 24 | JULES_WEBHOOK_BROADCASTER: `agent.broadcast(payload)` |
| `routes/api/projects/sentinel/clarify.ts` | 32 | JULES_WEBHOOK_BROADCASTER: `agent.broadcast(payload)` |
| `routes/api/projects/sentinel/submit.ts` | 84-85 | JUDGE_AGENT → GUARDRAIL_AGENT: `agent.judgeCodeQuality(...)` |

### 4.4 Add 3 Missing `@callable()` Methods (D2)

| Agent | Method | Implementation |
|-------|--------|---------------|
| `JulesWebhookBroadcaster` | `broadcast(payload)` | WebSocket fan-out to connected clients |
| `DesignAgent` | `stream(runId)` | SSE stream for design pipeline progress (or document onRequest exception) |
| `LearningAgent` | `diagnose(errorInfo)` | AI-powered health failure analysis via `this.ai.generateStructuredResponse` |

### 4.5 Route Modularization (C1–C2)

Move 12 loose route files from `routes/api/` to category subdirectories:

| Current | Destination |
|---------|-------------|
| `actions.ts` | `github/actions.ts` |
| `agent-planning.ts` | `agents/planning.ts` |
| `backlog.ts` | `projects/backlog.ts` |
| `continuous-learning.ts` | `learning/continuous-learning.ts` |
| `health.ts` | `ops/health-root.ts` |
| `planning.ts` | `projects/planning.ts` |
| `research-orchestration.ts` | `research/orchestration.ts` |
| `reverse-engineering.ts` | `tools/reverse-engineering.ts` |
| `sandbox.ts` | `tools/sandbox.ts` |
| `skills.ts` | `ai/skills.ts` |
| `standardization.ts` | `ops/standardization.ts` |
| `stitch.ts` | `design/stitch.ts` |

Keep `auth.ts` and `index.ts` in place. Update `routes/api/index.ts` imports (C2).

### 4.6 HITL and Health Integration (from v3 Phase 3)

**P3-WEBHOOK-HITL**: In `routes/api/webhooks/index.ts`, replace auto-trigger with `new HitlQueue(env).propose(...)`. Return 202 with `{ status: 'queued', hitlId }`.

**P3-HITL-ROUTES**: New `routes/api/hitl.ts` — `GET /api/hitl`, `POST /api/hitl/:id/approve`, `POST /api/hitl/:id/reject`, `POST /api/hitl/:id/iterate`.

**P3-HEALTH-COORDINATOR**: Add per-agent health checks to `health/coordinator.ts` for all 9 canonical agents. Frontend agents must have `assistant_ui_stream_compatible` in capabilities.

### 4.7 Type Regeneration (A5)

After all route and wrangler changes: `npx wrangler types` → `npx tsc --noEmit` → `npx wrangler deploy --dry-run`.

---

## Phase 5: Chat Migration

Depends on Phase 3 (agents migrated) + Phase 2 B1–B4 (new chat schema in D1).

### B5. Migrate Chat API Routes

In `routes/api/frontend/ai/chat.ts`:
- `chatThreads` → `threads` (field rename: `subject` → `title`, `agentId` → `hostAgentId`)
- `chatMessages` → `messages` (plain text → JSON assistant-ui parts format)
- On thread create: insert hosting agent into `thread_participants` with `role: 'host'`
- When routing to a second agent: insert as `participant`

### B6. Update CollaborationSpace D1 Mirroring

In `CollaborationSpace/methods/messaging.ts` (was `ChatRoom/methods/messaging.ts`):
- On first message in a room: create `threads` row with `source: 'chatroom'`, `roomId`
- Map messages to unified format: `role: 'agent'`, `author: agentName`, `content: JSON parts`
- Dual-write to `chatRoomLogs` during transition via `ctx.waitUntil()`
- Track room→thread mapping in CollaborationSpace DO SQLite

### B7. Agent onChatMessage → Unified Schema

Create `ai/agents/shared/chat-persistence.ts` utility. Each agent's `onChatMessage` (inherited via `BaseChatAgent`) should:
1. Create/find a `threads` row with `hostAgentId = this.agentName`
2. Insert user message with `role: 'user'`
3. Insert agent response with `role: 'assistant'`, `author: this.agentName`
4. When calling another agent via RPC: insert `role: 'agent'`, `author: calledAgent`; add to `thread_participants` as `'participant'`

### B8. Deprecate Old Chat Schemas

- Remove `export * from './chat'` from `db/schemas/agents/index.ts`
- Add `@deprecated` JSDoc to `db/schemas/agents/chat.ts`
- Mark `chatRoomLogs` in `mirror.ts` as `@deprecated`
- Stop dual-writing when transition verified
- Keep D1 tables — historical data only

---

## File Structure (Definitive)

```
src/backend/src/
├── ai/
│   ├── agents/
│   │   ├── exports.ts                         ← Remove legacy section after E3
│   │   ├── ChatRoom.ts                        ← DELETE (A1, Phase 2)
│   │   ├── CollaborationSpace/                ← RENAME from ChatRoom/ (Phase 3)
│   │   │   └── index.ts                       ← extends BaseChatAgent
│   │   ├── OrchestratorAgent/                 ← extends BaseChatAgent (Phase 3)
│   │   ├── ResearchAgent/                     ← extends BaseChatAgent (Phase 3)
│   │   ├── CloudflareAgent/                   ← extends BaseChatAgent (Phase 3)
│   │   ├── EngineerAgent/                     ← extends BaseAgent (Phase 3)
│   │   ├── GithubAgent/                       ← extends BaseAgent; repo.ts added (A2)
│   │   ├── GuardrailAgent/                    ← extends BaseAgent (Phase 3)
│   │   ├── LearningAgent/                     ← extends BaseAgent; diagnose() added (D2)
│   │   ├── WorkshopAgent/                     ← extends BaseAgent; flat files deleted (A1)
│   │   ├── DesignAgent/                       ← extends BaseAgent; stream() added (D2)
│   │   └── OverseerAgent/                     ← DELETE (E3, Phase 4)
│   │
│   └── providers/
│       ├── index.ts                            ← re-exports BaseAgent, BaseChatAgent
│       ├── types.ts                            ← AIOptions + skills?: string[]
│       ├── methods/generation.ts              ← skill injection in all 6 methods
│       ├── vendors/jules.ts                    ← two-step with D1 system prompt
│       └── agent-support/
│           ├── index.ts                        ← barrel exports
│           ├── base-agent.ts                   ← NEW (Phase 1)
│           ├── base-chat-agent.ts              ← NEW (Phase 1); import from "agents"
│           ├── skills.ts                       ← NEW (Phase 1)
│           ├── hitl-queue.ts                   ← NEW (Phase 1); imports from workflows/hitl.ts
│           ├── collaboration.ts               ← NEW (Phase 1)
│           └── state-store.ts                 ← MODIFY: add D1 mirror (Phase 1)
│
├── db/
│   ├── schemas/
│   │   ├── agents/
│   │   │   ├── mirror.ts                      ← EXISTING: agentStateMirror (no change)
│   │   │   ├── collaborations.ts              ← NEW (Phase 1)
│   │   │   └── chat.ts                        ← @deprecated after Phase 5
│   │   ├── workflows/
│   │   │   └── hitl.ts                        ← EXISTING — import from here only
│   │   └── chats/
│   │       ├── threads.ts                     ← MODIFY: add agent columns (B1)
│   │       ├── messages.ts                    ← MODIFY: add metadata (B2)
│   │       ├── participants.ts                ← NEW (B3)
│   │       └── index.ts                       ← ADD participants export
│   ├── schema.core.ts                         ← ADD chats export (B4)
│   └── services/agent-config/seed.ts          ← ADD missing entries (Phase 1)
│
├── routes/api/
│   ├── index.ts                               ← UPDATE imports after C1
│   ├── auth.ts                                ← no change
│   ├── hitl.ts                                ← NEW (Phase 4)
│   ├── webhooks/index.ts                      ← HITL propose instead of auto-trigger
│   ├── github/actions.ts                      ← MOVED from actions.ts (C1)
│   ├── agents/planning.ts                     ← MOVED from agent-planning.ts (C1)
│   ├── projects/backlog.ts                    ← MOVED from backlog.ts (C1)
│   ├── learning/continuous-learning.ts        ← MOVED (C1)
│   ├── ops/health-root.ts                     ← MOVED from health.ts (C1)
│   ├── projects/planning.ts                   ← MOVED from planning.ts (C1)
│   ├── research/orchestration.ts              ← MOVED (C1)
│   ├── tools/reverse-engineering.ts           ← MOVED (C1)
│   ├── tools/sandbox.ts                       ← MOVED (C1)
│   ├── ai/skills.ts                           ← MOVED from skills.ts (C1)
│   ├── ops/standardization.ts                 ← MOVED (C1)
│   └── design/stitch.ts                       ← MOVED from stitch.ts (C1)
│
└── health/coordinator.ts                      ← ADD per-agent health checks (Phase 4)
```

### Files to Delete

| File | Phase | Requires |
|------|-------|---------|
| `ai/agents/ChatRoom.ts` | 2 (A1) | Grep confirms no imports |
| `ai/agents/WorkshopAgent/CfAgentsSdk.ts` | 2 (A1) | Grep confirms no imports |
| `ai/agents/WorkshopAgent/UxResearcher.ts` | 2 (A1) | Grep confirms no imports |
| `ai/agents/WorkshopAgent/WorkshopAgent.ts` | 2 (A1) | Grep confirms no imports |
| `services/octokit/skill-fetcher.ts` | 3 | Grep confirms no imports |
| `ai/agents/OverseerAgent/` | 4 (E3) | Wrangler reset complete |
| All `todo_integration/` dirs (28 files) | 4 (E3) | Wrangler reset complete |

---

## Verification

```bash
# 1. TypeScript — zero errors
npx tsc --noEmit

# 2. Dry-run — all DO bindings resolve (including CollaborationSpace)
npx wrangler deploy --dry-run

# 3. Stale binding check — zero matches
grep -r "GEMINI_AGENT\|DEEP_RESEARCH_CHAT_AGENT\|SUPERVISOR\|WEB_SEARCH_AGENT\|JUDGE_AGENT\|TOPIC_ORCHESTRATOR\|JULES_OVERSEER\|CLOUDFLARE_DOCS_AGENT\|OVERSEEER_AGENT" src/backend/src/routes src/backend/src/workflows

# 4. Anti-pattern check — zero matches
grep -rn "\.fetch(new Request(" src/backend/src/routes

# 5. Health endpoint — all 9 agents present
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'
# OrchestratorAgent, ResearchAgent, CloudflareAgent → isFrontendFacing: true, assistant_ui_stream_compatible
# EngineerAgent, GithubAgent, GuardrailAgent, LearningAgent, WorkshopAgent, DesignAgent → isFrontendFacing: false

# 6. Skill injection — trigger OrchestratorAgent.submitBrief
# Worker logs: <skill_context> block in systemPrompt

# 7. Jules two-step — generateStructuredResponse with provider='jules'
# Logs: step-2 system prompt from D1, STRUCTURING_MODEL used

# 8. CollaborationSpace — EngineerAgent opens session
# SELECT * FROM collaboration_sessions → active row

# 9. HITL round-trip
# POST /api/webhooks PR event → 202, hitl_proposals pending row
# POST /api/hitl/:id/approve → hitl_decisions approved row

# 10. Unified chat schema
# Chat with OrchestratorAgent → thread in threads table with hostAgentId='OrchestratorAgent'
# SELECT * FROM thread_participants → host row for OrchestratorAgent

# 11. Export alignment
# For every class_name in wrangler.jsonc → grep matching export in src/backend/src/exports.ts

# 12. Migration test
pnpm run migrate:local

# 13. No loose route files
ls src/backend/src/routes/api/*.ts  # Should only show auth.ts, index.ts, hitl.ts
```
