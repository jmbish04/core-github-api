# Standardize Agents — Tasks v2

**Date:** 2026-04-17  
**Reference:** `docs/20260417/standardize_agents/v2/PLAN.md`  
**Format:** Ordered markdown tasks grouped by phase with success criteria.

> Execute phases sequentially. Run `npx tsc --noEmit` at the end of every phase before proceeding.  
> Each phase ends with a commit. Commits must be green (no type errors, no broken imports).

---

## Phase 0 — Audit (Read-Only, No Code Changes)

### TASK-000: Audit all AI invocations across all agents

**Type:** audit  
**Priority:** CRITICAL — nothing proceeds until this is done  
**Files:** `src/backend/src/ai/agents/**/*.ts`

Run the following greps and document findings before writing any code:

```bash
# Find all hardcoded system prompt strings (multiline template literals)
grep -rn "systemPrompt\s*=\s*\`\|const.*prompt.*=.*\`\|systemInstructions\s*=" src/backend/src/ai/agents/

# Find all hardcoded provider/model strings
grep -rn "provider.*['\"]gemini\|provider.*['\"]openai\|provider.*['\"]worker\|model.*@cf\|model.*gpt-\|model.*gemini" src/backend/src/ai/agents/

# Find generateText calls that instruct JSON output (should be generateStructuredResponse)
grep -rn "generateText\|generateChatText" src/backend/src/ai/agents/ | grep -v "generateStructured"

# Find all buildSkillContext usages (to be replaced in Phase 2)
grep -rn "buildSkillContext\|skill-fetcher" src/backend/src/ai/agents/

# Find all agents with custom onStart() logic to preserve in agentInit()
grep -rn "async onStart" src/backend/src/ai/agents/
```

**Success criteria:**  
- You have a list of every agent method that hardcodes prompts/providers/models → these need entries in `agent-config/seed.ts`
- You have a list of every `generateText` call that returns JSON → these need conversion to `generateStructuredResponse`
- You have a complete list of `buildSkillContext` call sites → these are removed in Phase 2

---

## Phase 1 — Foundation (ai/providers layer)

### TASK-101: Add `skills` to AIOptions

**Type:** modify  
**Priority:** CRITICAL  
**File:** `src/backend/src/ai/providers/types.ts`

Add to `AIOptions` interface:
```typescript
skills?: string[];  // Skill names from agent_skills D1 table — injected as <skill_context>
```

**Success criteria:** TypeScript compiles. No other files changed.

---

### TASK-102: Create SkillManager

**Type:** new  
**Priority:** CRITICAL  
**File:** `src/backend/src/ai/providers/agent-support/skills.ts`

Implement `SkillManager` class per PLAN.md §4.1. Key requirements:
- Uses `getDb(env.DB)` + `agentSkills` table (already exists in `db/schemas/agents/skills.ts`)
- Returns `<skill_context>...</skill_context>` wrapped string
- Never throws — catch errors, log warning, return `""`
- Returns `""` for empty `skillNames` array without hitting D1

**Success criteria:** TypeScript compiles. Calling `new SkillManager(env).getSkillInstructions([])` returns `""`. Calling with a valid skill name returns wrapped content.

---

### TASK-103: Inject skills in all generation methods

**Type:** modify  
**Priority:** CRITICAL  
**File:** `src/backend/src/ai/providers/methods/generation.ts`

At the start of each of these functions, add the skill injection block from PLAN.md §4.1:
- `generateTextImpl`
- `generateStructuredResponseImpl`
- `generateTextWithToolsImpl`
- `generateStructuredWithToolsImpl`
- `generateTextFromFilesImpl`
- `generateStructuredResponseFromFilesImpl`

Skill injection runs BEFORE any provider dispatch. It mutates `systemPrompt` in-scope.

**Success criteria:** TypeScript compiles. Calling `ai.generateText(prompt, system, { skills: ["test-skill"] })` does not throw. Logs show `<skill_context>` in the systemPrompt when skills are loaded.

---

### TASK-104: Formalize Jules two-step in `vendors/jules.ts`

**Type:** modify  
**Priority:** HIGH  
**File:** `src/backend/src/ai/providers/vendors/jules.ts`

Review the existing partial implementation of `generateStructuredResponse`. Complete it per PLAN.md §4.2:
- Step 1: Jules text with schema description appended
- Step 2: `generateObject()` with `STRUCTURING_MODEL` (`@cf/meta/llama-4-scout-17b-16e-instruct`) and the original Zod schema
- Error handling: if Jules step 1 fails, fall back to Workers AI `generateStructuredResponse` directly
- The caller interface is unchanged — same method signature as all other vendors

**Success criteria:** Calling `ai.generateStructuredResponse(prompt, schema, system, { provider: "jules" })` returns a typed `T` without throwing.

---

### TASK-105: Create AgentHealthService base checks

**Type:** new  
**Priority:** HIGH  
**File:** `src/backend/src/ai/providers/agent-support/health-base.ts`

Static method `AgentHealthService.baseChecks(agentName, env, ctx)` returning:
```typescript
{
  agent: string;
  status: "ok" | "degraded";
  checks: {
    db: "ok" | "missing" | "error";
    ai: "ok" | "missing";
    edigraph: "ok" | "not_configured";
    db_roundtrip: "ok" | "error";
    ai_key: "ok" | "error";
  };
  timestamp: number;
}
```

D1 round-trip: `await env.DB.prepare("SELECT 1").run()`.  
AI key: `await new AIProvider(env).verifyApiKey()` with 3s timeout.  
All checks are non-fatal to each other — one failure doesn't abort others.

**Success criteria:** TypeScript compiles. Returns structured result even if bindings are missing.

---

### TASK-106: Create BaseAgent abstract class

**Type:** new  
**Priority:** CRITICAL  
**File:** `src/backend/src/ai/providers/agent-support/base-agent.ts`

Implement per PLAN.md §3.1. Key requirements:
- Correct imports: `Agent`, `callable` from `"agents"`
- `AgentStateStore` constructor: `{ ctx, env, agentName, initialState: { status: "idle", history: [] } }` (object param, not positional)
- `HitlQueue` and `CollaborationService` as first-class properties (create stubs if those files don't exist yet — mark with `// TODO: implement`)
- `EdigraphService` is optional (guarded by `env.EDGRAPH`)
- `agentInit()` and `agentHealth()` are optional protected hooks
- `isFrontendFacing: false` in healthProbe return
- `@callable()` decorator on `ping()` and `healthProbe()`

**Success criteria:** TypeScript compiles. An agent can `extends BaseAgent` with just `readonly agentName = "Test"` and compile cleanly.

---

### TASK-107: Create BaseChatAgent abstract class

**Type:** new  
**Priority:** CRITICAL  
**File:** `src/backend/src/ai/providers/agent-support/base-chat-agent.ts`

Implement per PLAN.md §3.2. Key requirements:
- Correct import: `AIChatAgent` from `"@cloudflare/ai-chat"` (NOT from `"agents"`)
- `onChatMessage(onFinish)` default implementation using `streamText` + `convertToModelMessages(this.messages)` + `toUIMessageStreamResponse()`
- `verifyChatFormat()` private method — concrete implementation per PLAN.md §3.2 (not a stub)
- `isFrontendFacing: true` in healthProbe return
- `assistant_ui_stream_compatible` added to capabilities only if `verifyChatFormat()` returns `{ ok: true }`

**Success criteria:** TypeScript compiles. An agent `extends BaseChatAgent` with just `readonly agentName = "Test"` compiles. `healthProbe()` returns `isFrontendFacing: true`.

---

### TASK-108: Add D1 mirror to AgentStateStore

**Type:** modify  
**Priority:** HIGH  
**File:** `src/backend/src/ai/providers/agent-support/state-store.ts`

Add `mirrorToD1(state)` private method per PLAN.md §8. Call via `this.ctx.waitUntil(this.mirrorToD1(...).catch(...))` in both `set()` and `patch()`.

Note: `agentStateMirror` table already exists in `db/schemas/agents/mirror.ts`. Import it directly — no migration needed.

**Success criteria:** TypeScript compiles. State writes don't throw if D1 fails (catch is present).

---

### TASK-109: Create HitlQueue service

**Type:** new  
**Priority:** HIGH  
**Files:**
- `src/backend/src/ai/providers/agent-support/hitl-queue.ts`
- `src/backend/src/db/schemas/agents/hitl.ts`
- `src/backend/src/db/migrations/XXXX_add_hitl.sql`

Implement `HitlQueue` class per PLAN.md §6. Create D1 schema for `hitl_proposals`, `hitl_revisions`, `hitl_decisions`. Migration SQL must be idempotent (`CREATE TABLE IF NOT EXISTS`).

**Success criteria:** TypeScript compiles. `new HitlQueue(env).propose({...})` returns a string ID.

---

### TASK-110: Create CollaborationService + CollaborationSpace schema

**Type:** new  
**Priority:** HIGH  
**Files:**
- `src/backend/src/ai/providers/agent-support/collaboration.ts`
- `src/backend/src/db/schemas/agents/collaborations.ts`
- `src/backend/src/db/migrations/XXXX_add_collaborations.sql`

`CollaborationService` opens and manages `CollaborationSpace` DO instances via `getAgentByName`. Create D1 schema for `collaboration_sessions`, `collaboration_participants`, `collaboration_events` per PLAN.md §5.

**Success criteria:** TypeScript compiles. `new CollaborationService(env).openCollaboration({...})` resolves without error.

---

### TASK-111: Update barrel exports

**Type:** modify  
**Priority:** CRITICAL  
**Files:**
- `src/backend/src/ai/providers/agent-support/index.ts`
- `src/backend/src/ai/providers/index.ts`

Add exports for: `BaseAgent`, `BaseChatAgent`, `SkillManager`, `HitlQueue`, `CollaborationService`, `AgentHealthService`.

Re-export `BaseAgent` and `BaseChatAgent` from the top-level `providers/index.ts`.

**Success criteria:** TypeScript compiles. `import { BaseAgent, BaseChatAgent } from "@/ai/providers"` resolves.

---

### TASK-112: Seed missing agent-config entries

**Type:** modify  
**Priority:** HIGH  
**File:** `src/backend/src/db/services/agent-config/seed.ts`

Using TASK-000 audit findings: add entries for every agent/function combination that currently hardcodes prompts or provider/model. Current seed has 24 entries — expect 20–40 additions covering: OverseerAgent (all methods), LearningAgent (all methods), WorkshopAgent (remaining methods), all `onChatMessage` entries for frontend agents, all agents currently not in the seed.

**Success criteria:** Every agent/function pair used in Phase 2 migration has a seed entry. TypeScript compiles.

---

**Phase 1 commit checkpoint:** `npx tsc --noEmit` → zero errors → commit `feat: phase-1 ai/providers foundation (skills, base classes, hitl, collab)`

---

## Phase 2 — Agent Migration

> For every agent: change `extends` clause → `readonly agentName` → rename `onStart()` to `agentInit()` (keep only agent-specific init) → remove redundant `this.ai`/`this.logger`/`this.store` init → remove duplicate `ping()`/`healthProbe()` methods → replace `buildSkillContext()` with `options: { skills: this.skills }` → update AI calls to use `getAgentFunctionConfig` for config

---

### TASK-201: Create CollaborationSpace (rename from ChatRoom)

**Type:** new/rename  
**Priority:** CRITICAL — must come first (other agents may collaborate via it)  
**Files:**
- `src/backend/src/ai/agents/CollaborationSpace/index.ts` (new)
- `src/backend/src/ai/agents/CollaborationSpace/methods/messaging.ts` (from ChatRoom/methods/)
- `src/backend/src/ai/agents/exports.ts` (update)
- `src/backend/src/ai/agents/ChatRoom.ts` (**DELETE** — confirm not in exports first)

`CollaborationSpace` extends `BaseChatAgent`. `readonly agentName = "CollaborationSpace"`. Implement `@callable()` methods: `openSession`, `addCollaborator`, `postMessage`, `triggerCollaborator`, `getEvents`, `closeSession`.

The existing `ChatRoom/index.ts` messaging logic (DO SQLite + D1 mirror) moves into `CollaborationSpace`. The root `ChatRoom.ts` is deleted (grep confirms it is not in `exports.ts`).

Update `exports.ts` to export `CollaborationSpace`.  
Update `wrangler.jsonc` if binding name changes (search for `CHAT_ROOM` binding).

**Success criteria:** TypeScript compiles. No import errors for `CollaborationSpace`. Root `ChatRoom.ts` is gone.

---

### TASK-202: Migrate OrchestratorAgent → BaseChatAgent

**Type:** modify  
**Priority:** CRITICAL  
**Files:** `src/backend/src/ai/agents/OrchestratorAgent/index.ts` + all `methods/*.ts`

- `extends BaseChatAgent`
- `readonly agentName = "OrchestratorAgent"`
- `protected readonly skills = ["plan-writing", "architecture", "task-management"]`
- `agentInit()`: OrchestratorAgent currently has no custom `onStart` — empty or minimal
- `agentHealth()`: ping all agent bindings via RPC, return `rpc:{AgentName}:ok|fail` per binding
- Remove all `buildSkillContext` calls → `options: { skills: this.skills }`
- Convert all hardcoded prompts to `getAgentFunctionConfig(this.agentName, functionName)` lookups

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: true`.

---

### TASK-203: Migrate ResearchAgent → BaseChatAgent

**Type:** modify  
**Priority:** CRITICAL  
**Files:** `src/backend/src/ai/agents/ResearchAgent/index.ts` + all `methods/*.ts`

- `extends BaseChatAgent`
- `readonly agentName = "ResearchAgent"`
- `protected readonly skills = ["deep-research", "plan-writing", "brainstorming", "source-evaluation"]`
- `agentInit()`: no custom init currently (ResearchAgent's `onStart` only inits AIProvider)
- `agentHealth()`: verify Edigraph connectivity + D1 research tables accessible
- Remove all `buildSkillContext` calls (heavy usage in `topic-orchestrator.ts`, `deep-research.ts`, etc.)

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: true`.

---

### TASK-204: Migrate CloudflareAgent → BaseChatAgent

**Type:** modify  
**Priority:** CRITICAL  
**Files:** `src/backend/src/ai/agents/CloudflareAgent/index.ts` + all `methods/*.ts`

- `extends BaseChatAgent` (changes from `Agent<Env>` — CloudflareAgent is a frontend chat agent)
- `readonly agentName = "CloudflareAgent"`
- `protected readonly skills = ["cloudflare-docs", "workers-architecture", "debugging"]`
- `agentInit()`: preserve existing `AgentStateStore` setup (already uses one)
- `agentHealth()`: verify Cloudflare API token + CF docs KV binding accessible
- Remove `buildSkillContext` calls + `ensureReady()` (now inherited)

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: true`.

---

### TASK-205: Migrate EngineerAgent → BaseAgent

**Type:** modify  
**Priority:** CRITICAL  
**Files:** `src/backend/src/ai/agents/EngineerAgent/index.ts` + all `methods/*.ts`

- `extends BaseAgent` (changes from `AIChatAgent`)
- `readonly agentName = "EngineerAgent"`
- `protected readonly skills = ["engineering-best-practices", "code-review", "sprint-planning"]`
- `agentInit()`: preserve DO SQLite DDL migration + D1 recovery logic
- `agentHealth()`: Jules session creation test + D1 migration status
- **Important:** Any method running Jules sessions must wrap with `await this.keepAliveWhile(async () => { ... })` to prevent DO eviction mid-task (DOs evict after ~70–140s inactivity)
- Remove all `buildSkillContext` calls

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: false`.

---

### TASK-206: Migrate GithubAgent → BaseAgent

**Type:** modify  
**Priority:** HIGH  
**Files:** `src/backend/src/ai/agents/GithubAgent/index.ts` + all `methods/*.ts`

- `extends BaseAgent` (changes from `AIChatAgent`)
- `readonly agentName = "GithubAgent"`
- `protected readonly skills = ["code-review", "pr-standards", "github-best-practices"]`
- `agentInit()`: preserve existing `AgentStateStore` setup + DO SQLite DDL migration
- `agentHealth()`: GitHub API key verification (`GET /user` with 3s timeout) + webhook D1 table accessible

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: false`.

---

### TASK-207: Migrate GuardrailAgent → BaseAgent

**Type:** modify  
**Priority:** HIGH  
**Files:** `src/backend/src/ai/agents/GuardrailAgent/index.ts` + all `methods/*.ts`

- `extends BaseAgent` (changes from `AIChatAgent`)
- `readonly agentName = "GuardrailAgent"`
- `protected readonly skills = ["code-review-checklist", "evidence-discipline", "golden-path-standards", "security-review"]`
- `agentInit()`: preserve DO SQLite DDL + `warmRuleCacheFromD1()` logic
- `agentHealth()`: D1 guardrail rules table has rows + rule cache is warm in DO storage

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: false`.

---

### TASK-208: Migrate LearningAgent → BaseAgent

**Type:** modify  
**Priority:** HIGH  
**Files:** `src/backend/src/ai/agents/LearningAgent/index.ts` + all `methods/*.ts`

- `extends BaseAgent` (no change — already `Agent<Env>`)
- `readonly agentName = "LearningAgent"`
- `protected readonly skills = ["continuous-learning", "pattern-extraction"]`
- `agentInit()`: LearningAgent currently has no `onStart()` body — `agentInit` is empty
- `agentHealth()`: verify HITL D1 table accessible + any CI API connectivity

Note: LearningAgent is the primary consumer of `HitlQueue`. Wire `this.hitl` into its approval/dispatch logic.

**Success criteria:** TypeScript compiles. `healthProbe()` returns `isFrontendFacing: false`.

---

### TASK-209: Migrate WorkshopAgent, DesignAgent, OverseerAgent → BaseAgent

**Type:** modify  
**Priority:** HIGH  
**Files:** `{WorkshopAgent,DesignAgent,OverseerAgent}/index.ts` + `methods/*.ts`

Same pattern for all three:

**WorkshopAgent**: `extends BaseAgent`, `skills = ["spec-writing", "architecture", "workshop-facilitation"]`, `agentInit()` preserves `AgentStateStore` setup.

**DesignAgent (StitchDesignAgent)**: `extends BaseAgent`, `skills = ["frontend-design", "react-best-practices", "ui-ux-pro-max"]`, `agentInit()` is minimal. Remove heavy `buildSkillContext` usage — skills now in `this.skills`.

**OverseerAgent**: `extends BaseAgent`, `skills = []`, `agentInit()` is minimal. Note: OverseerAgent is largely TODO — mark non-implemented methods clearly but do not delete them.

**Success criteria:** All three compile. Each `healthProbe()` returns `isFrontendFacing: false`.

---

### TASK-210: Delete legacy files

**Type:** delete  
**Priority:** CRITICAL  
**Files:**
- `src/backend/src/ai/agents/ChatRoom.ts` — confirm `grep -r "ChatRoom.ts\|from.*ChatRoom'" src/` shows no imports
- `src/backend/src/services/octokit/skill-fetcher.ts` — confirm `grep -r "skill-fetcher\|buildSkillContext" src/` returns zero results

Delete only after grep confirms no remaining references.

**Success criteria:** Zero remaining imports of deleted files. TypeScript compiles.

---

**Phase 2 commit checkpoint:** `npx tsc --noEmit` → zero errors → commit `feat: phase-2 migrate all agents to BaseAgent/BaseChatAgent`

---

## Phase 3 — Integration

### TASK-301: Wire GitHub webhooks to HitlQueue

**Type:** modify  
**Priority:** HIGH  
**Files:**
- `src/backend/src/routes/api/webhooks/index.ts`
- `src/backend/src/routes/api/hitl.ts` (new)

In `webhooks/index.ts`: replace every auto-trigger pattern with `new HitlQueue(env).propose({...})`. Return `c.json({ status: "queued", hitlId }, 202)`. Existing `delivery_id` deduplication (already in place) prevents duplicate proposals.

New `routes/api/hitl.ts`:
- `GET /api/hitl` — list proposals (query params: `?repoOwner`, `?repoName`, `?status`)
- `POST /api/hitl/:id/approve` — approve + execute
- `POST /api/hitl/:id/reject` — reject with reason
- `POST /api/hitl/:id/iterate` — submit feedback, create revision

**Success criteria:** Sending a GitHub PR webhook returns `202 { status: "queued" }`. D1 `hitl_proposals` row exists. No agent action fires automatically.

---

### TASK-302: Integrate per-agent health into coordinator

**Type:** modify  
**Priority:** HIGH  
**File:** `src/backend/src/health/coordinator.ts`

Add per-agent health checks per PLAN.md §7. Use existing coordinator's 8-second per-check timeout pattern. Check name format: `agent:{AgentName}`.

Frontend-facing agents (`isFrontendFacing: true`) additionally validated: if `assistant_ui_stream_compatible` is not in `capabilities`, mark check as `fail`.

**Success criteria:** `GET /health` returns checks for `agent:OrchestratorAgent`, `agent:ResearchAgent`, `agent:CloudflareAgent`, `agent:EngineerAgent`, etc.

---

### TASK-303: TypeScript compilation gate

**Type:** verify  
**Priority:** CRITICAL

```bash
cd src/backend && npx tsc --noEmit
```

Zero errors. Common expected issues:
- Missing binding types for `COLLABORATION_SPACE` in `Env` interface → add to `wrangler.jsonc` bindings
- `AgentStateStore` generic type param issues from removed state generics
- `AIChatAgent` version mismatch if `@cloudflare/ai-chat` needs update

Fix all before proceeding.

---

### TASK-304: Dry-run deployment gate

**Type:** verify  
**Priority:** CRITICAL

```bash
pnpm run dry-run
```

All DO bindings must resolve. New bindings required:
- `COLLABORATION_SPACE` — add to `wrangler.jsonc` if not present
- Verify all existing agent bindings still resolve after rename of `ChatRoom` → `CollaborationSpace`

**Success criteria:** Dry-run exits 0. No unresolved binding errors.

---

**Phase 3 commit checkpoint:** `npx tsc --noEmit` → `pnpm run dry-run` → both pass → commit `feat: phase-3 hitl webhook pipeline + health coordinator integration`

---

## End-to-End Verification Checklist

After Phase 3, verify each of the following before marking the work complete:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `pnpm run dry-run` exits 0
- [ ] `GET /health` includes `agent:*` checks for all 10 agents
- [ ] OrchestratorAgent, ResearchAgent, CloudflareAgent health checks include `assistant_ui_stream_compatible`
- [ ] Skill injection: trigger OrchestratorAgent call → Worker logs show `<skill_context>` block
- [ ] Jules two-step: call `ai.generateStructuredResponse(prompt, schema, sys, { provider: "jules" })` → returns typed T
- [ ] CollaborationSpace: `openSession` → D1 `collaboration_sessions` row created
- [ ] HITL: POST webhook → 202 + `hitl_proposals` row pending, no auto-action
- [ ] HITL: POST `/api/hitl/:id/approve` → `hitl_decisions` row + deferred action fires
- [ ] Frontend chat: `useAgentChat` → OrchestratorAgent → streaming response (no spinner)
- [ ] Frontend chat: `healthProbe()` `chat_format.ok === true` for all 3 frontend agents
- [ ] Root `ChatRoom.ts` is deleted
- [ ] `skill-fetcher.ts` is deleted, zero remaining imports

---

## Quick Reference: Per-Agent Migration Checklist

```
□ extends → BaseAgent or BaseChatAgent (per taxonomy table)
□ readonly agentName = "..."
□ protected readonly skills = [...]
□ onStart() renamed to agentInit() — only agent-specific logic preserved
□ this.ai = new AIProvider(...)  ← REMOVED (inherited)
□ this.logger = new Logger(...)  ← REMOVED (inherited)
□ this.store = new AgentStateStore(...) ← REMOVED (inherited)
□ healthProbe() / ping() methods ← REMOVED (inherited)
□ buildSkillContext() calls ← REMOVED → options: { skills: this.skills }
□ Hardcoded prompts ← REPLACED with getAgentFunctionConfig()
□ generateText() with JSON instructions ← CONVERTED to generateStructuredResponse()
□ Long Jules/research ops ← WRAPPED in keepAliveWhile()  [BaseAgent only]
□ agentHealth() override → agent-specific checks
□ isFrontendFacing:false (BaseAgent) or true (BaseChatAgent) in healthProbe
```
