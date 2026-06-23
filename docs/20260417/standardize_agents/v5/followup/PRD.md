# v5 Follow-Up — Product Requirements Document

**Date:** 2026-04-20
**Parent plan:** `docs/20260417/standardize_agents/v5/PLAN.md`
**Scope:** Close the remaining gaps between the v5 architectural plan and the actual state of the code.

---

## Context

A Phase 0 audit of `src/backend/src/` against `v5/PLAN.md` revealed that **the Foundation (Phase 1) and most of the Agent Migration (Phase 3) work is already landed in the codebase.** The v5 plan was written before accounting for the progress that had been quietly made. This follow-up PRD re-scopes the remaining work to only what is actually missing.

### What Is Already Done (verified 2026-04-20)

| Area | v5 Phase | Status |
|------|----------|--------|
| `AIOptions.skills?: string[]` + `skillContext?: string` | P1-TYPES | ✅ Present in `types.ts` |
| Enhanced `SkillManager` (cache, prefetch, resolveEffective, 5-min TTL) | P1-SKILLMANAGER-ENHANCED | ✅ `agent-support/skills.ts` |
| `AIProvider.skills` public + `warmSkillCache()` | P1-AI-PROVIDER-SKILLS-API | ✅ `providers/index.ts` |
| Skill injection in all 6 generation methods | P1-GENERATION | ✅ `resolveSystemPrompt()` in `methods/generation.ts` |
| Jules two-step (Jules → Workers AI structuring) w/ skillContext bypass | P1-JULES-STRUCTURED | ✅ `vendors/jules.ts` |
| `AgentStateStore` w/ D1 mirror on set/patch | P1-STATE-STORE-MIRROR | ✅ `state-store.ts`, `mirrorToD1()` |
| Collaboration schema (sessions/participants/events) | P1-COLLAB-SCHEMA | ✅ `db/schemas/agents/collaborations.ts` |
| `HitlQueue` class | P1-HITL-SERVICE | ✅ `agent-support/hitl-queue.ts` |
| `CollaborationService` class | P1-COLLAB-SERVICE | ✅ `agent-support/collaboration-service.ts` |
| `BaseAgent` abstract class | P1-BASE-AGENT | ✅ `agent-support/base-agent.ts` (173 lines) |
| `BaseChatAgent` abstract class | P1-BASE-CHAT-AGENT | ✅ `agent-support/base-chat-agent.ts` |
| `X-Agent-Skills` header extraction (onRequest) | P1-SKILL-PROTOCOL | ✅ BaseChatAgent uses `skills.extractHeaders()` |
| `resolveEffective()` skill merge in onChatMessage | P1-SKILL-PROTOCOL | ✅ via `resolveSystemPrompt()` |
| `VercelOptions.skillContext?: string` | P1-VERCEL-TYPES | ✅ `clients/vercel/types.ts` |
| `CollaborationSpace/` directory | P3-COLLAB-SPACE (rename) | ✅ `ai/agents/CollaborationSpace/index.ts` extends BaseChatAgent |
| Agent base class migration (10 of 11 agents) | P3-* | ✅ All active agents extend Base(Chat)Agent |
| OverseerAgent removed from wrangler bindings | A3-DISSOLVE-OVERSEER | ✅ Not in wrangler bindings (but directory still exists) |

### What Remains (this follow-up addresses)

Four surgical categories of work, none of which requires new Foundation code:

1. **Foundation polish** — a few missing pieces on the base classes (`ping()`, `verifyChatFormat()`).
2. **Agent refinements** — three agents still parse JSON from `generateText()` output manually instead of using `generateStructuredResponse`. CloudflareAgent needs three new `@callable()` methods. WorkshopAgent orchestration needs to actually call peer agents.
3. **Cleanup of legacy code** — `todo_integration/` directories, OverseerAgent directory, `skill-fetcher.ts`, and residual `buildSkillContext` call sites.
4. **Phase 4–5 work** — HITL routes, webhook HITL integration, per-agent health coordinator, route modularization, chat schema unification (`thread_participants`, `shared/chat-persistence.ts`), and the wrangler fresh v1 migration reset.

---

## Scope

### 1. Foundation Polish (`ai/providers/agent-support/`)

| Task | File | What's Missing |
|------|------|----------------|
| **F1** — Add `ping()` @callable to BaseAgent | `base-agent.ts` | Exists in BaseChatAgent.ChatRoom; not on BaseAgent. Adds uniform heartbeat for every agent. |
| **F2** — Add `verifyChatFormat()` static check | `base-chat-agent.ts` | v5 Rule 2 — must use `AbortSignal.timeout(0)` probe to confirm `toUIMessageStreamResponse` is a function. No live inference. Inject result into `healthProbe` capabilities. |

### 2. Agent Refinements

| Task | File | What's Missing |
|------|------|----------------|
| **A1** — Fix ResearchAgent JSON-via-generateText | `ai/agents/ResearchAgent/methods/deep-reasoning.ts:27` | Replace `generateText()` + manual JSON.parse with `generateStructuredResponse()` and a Zod schema. |
| **A2** — Fix GithubAgent JSON-via-generateText | `ai/agents/GithubAgent/index.ts:185–210` | Replace with `generateStructuredResponse()`. Remove the hardcoded system prompt at line 206 — use `getAgentFunctionConfig()`. |
| **A3** — Fix GuardrailAgent JSON-via-generateText | `ai/agents/GuardrailAgent/methods/judge.ts:46–49` | Replace with `generateStructuredResponse()` and a Verdict Zod schema. |
| **A4** — Add CloudflareAgent backend-consult @callable methods | `ai/agents/CloudflareAgent/methods/` | Create three new methods: `analyzeBindingNeeds(specs)`, `provisionBindings(defs)`, `validateImplementation(code, bindingConfig)`. Register as `@callable()` on the agent. |
| **A5** — Wire WorkshopAgent orchestration to peer agents | `ai/agents/WorkshopAgent/methods/workshop.ts` | `runWorkshop()` / `orchestrateTasks()` currently operates standalone. Add calls to `DesignAgent.runStitch()` → `CloudflareAgent.analyzeBindingNeeds()` → `CloudflareAgent.provisionBindings()` → `EngineerAgent.overseeJules(session, { designSpecs, bindingConfig })` → `GuardrailAgent.reviewImplementation(prUrl)` via @callable RPC. Evaluate and loop. |
| **A6** — Wire GuardrailAgent to consult CloudflareAgent | `ai/agents/GuardrailAgent/methods/judge.ts` | `reviewImplementation()` should call `CloudflareAgent.validateImplementation()` for CF-specific best-practice checks. (Superseded by v7 C1 — see docs/20260417/standardize_agents/v7/PRD.md) |
| **A7** — Consider `DesignAgent` → `BaseAgent` (verified — already is) | — | No action: audit confirmed `DesignAgent extends BaseAgent`. |
| **A8** — LearningAgent base class audit | `ai/agents/LearningAgent/index.ts` | Currently `BaseChatAgent` — v5 plan expected `BaseAgent`. Confirm intent: does LearningAgent have a chat surface in assistant-ui? If no, migrate to `BaseAgent`. If yes, leave as is. |

### 3. Legacy Cleanup

| Task | Target | Pre-condition |
|------|--------|---------------|
| **C1** — Delete `OverseerAgent/` directory | `ai/agents/OverseerAgent/` | Already unbound. Grep for imports across `src/` — must be zero. |
| **C2** — Delete `todo_integration/` directories | `ai/agents/*/todo_integration/` | Four dirs remain (CloudflareAgent, EngineerAgent, OrchestratorAgent, DesignAgent + possibly GithubAgent). Grep imports, migrate any needed logic into BaseAgent-subclass methods first, then delete. |
| **C3** — Remove residual `buildSkillContext()` call sites | `CfAgentsSdk.ts`, `LandingPageAgent.ts`, `Planner.ts` | Files are inside `todo_integration/` — covered by C2. |
| **C4** — Delete `services/octokit/skill-fetcher.ts` | `services/octokit/skill-fetcher.ts` | All `buildSkillContext` imports gone (after C2). Grep confirms zero imports. |

### 4. Phase 4–5 Work

| Task | File(s) | What |
|------|---------|------|
| **I1** — Create `thread_participants` table + migration | `db/schemas/chats/participants.ts`, new migration | Missing from `db/schemas/chats/`. Needs `threadId`, `agentName`, `role`, `joinedAt`, `leftAt`. |
| **I2** — Create `routes/api/hitl.ts` | new file | CRUD + approve/reject/iterate routes backed by `HitlQueue`. |
| **I3** — Webhook → HITL integration | `routes/api/webhooks/index.ts` | Currently dispatches directly via `getAgentByName()`. Convert to `hitlQueue.propose({...})` and return `202` with the proposal ID. |
| **I4** — Per-agent health in coordinator | `health/coordinator.ts` | `checkAgentsHealth()` must call `healthProbe()` on each bound agent in parallel, include `isFrontendFacing` flag and skill count in response. |
| **I5** — Fix 3 anti-pattern `.fetch(new Request(...))` sites | `routes/api/ux/index.ts`, `routes/api/sandbox.ts`, `routes/api/ops/health.ts` | Replace with `@callable()` RPC — or document the SSE-streaming exception with an inline comment. |
| **I6** — Fix 5 sentinel binding references | `routes/api/projects/sentinel/{submit,tasks,ws,mcp,index}.ts` | Sentinel was renamed. Audit binding names against current `wrangler.jsonc`, update stale references. |
| **I7** — Route modularization | `routes/api/*.ts` | Move the 12 loose files (`actions.ts`, `agent-planning.ts`, `backlog.ts`, `continuous-learning.ts`, `health.ts`, `planning.ts`, `research-orchestration.ts`, `reverse-engineering.ts`, `sandbox.ts`, `skills.ts`, `standardization.ts`, `stitch.ts`) into category subdirectories under `routes/api/`. Update root router. Leave only `auth.ts`, `index.ts`, and new `hitl.ts` at top level. |
| **I8** — Fresh wrangler v1 migration reset | `wrangler.jsonc` | 7 migration tags (v1, v1_sentinel, v2, v3, v4, v5, v6) → single fresh v1 entry that declares all current DO classes (16 including CollaborationSpace). Preserve production migration compat using wrangler's migration guard pattern. |
| **I9** — Chat persistence shared module | `ai/agents/shared/chat-persistence.ts` (new) | Shared helper that every agent calls on message send/receive to mirror to unified `threads/messages/thread_participants` schema. |
| **I10** — CollaborationSpace D1 mirroring | `ai/agents/CollaborationSpace/index.ts` | On message post, write to unified chat schema (thread per session; participant rows). |
| **I11** — Deprecate old chat schemas | `db/schemas/agents/chat.ts`, `chatRoomLogs` | After I9 + I10 land and routes read from unified schema, mark old tables as deprecated. |

---

## Explicit Non-Goals

- No re-architecture of the Skills pathway — static + dynamic header pathway is working.
- No changes to `AIProvider` generation method signatures.
- No new vendor clients.
- No frontend work (assistant-ui UI for skill management, HITL queue viewports are separate PRs).
- No changes to existing `@callable()` method signatures on already-migrated agents.

---

## Open Questions (decide before implementation)

1. **LearningAgent base class (A8):** Does LearningAgent have a current chat surface in assistant-ui? If yes → keep `BaseChatAgent`. If no → migrate to `BaseAgent` and remove any stub chat hooks.
2. **CloudflareAgent provisioning method (A4):** Does `provisionBindings()` actually create CF bindings via the CF API (requires CF API token binding), or does it only return a wrangler config fragment that EngineerAgent asks Jules to apply? The safer default is the latter (config-only; no live provisioning) — confirm before implementation.
3. **Wrangler migration reset (I8):** The v5 plan calls for a fresh v1 migration. In production this requires durable-object re-registration. Confirm whether this will be run against the production DB or only in dev/preview, because this is a one-way migration.
4. **OverseerAgent directory delete (C1):** v5 plan says "delete in Phase 4 after wrangler reset." Confirm whether we delete `ai/agents/OverseerAgent/` before or after I8.

---

## Verification

After all tasks land, the following must pass:

```bash
npx tsc --noEmit                          # zero errors
npx wrangler types
npx wrangler deploy --dry-run

# Legacy bindings — expect zero matches
grep -rE "GEMINI_AGENT|DEEP_RESEARCH_CHAT_AGENT|SUPERVISOR|WEB_SEARCH_AGENT|JUDGE_AGENT|TOPIC_ORCHESTRATOR|JULES_OVERSEER|CLOUDFLARE_DOCS_AGENT" \
  src/backend/src/routes src/backend/src/workflows

# Anti-pattern — expect zero (or only documented SSE exceptions)
grep -rn "\.fetch(new Request(" src/backend/src/routes

# Legacy buildSkillContext — expect zero
grep -rn "buildSkillContext\|skill-fetcher" src/backend/src/ai

# Loose route files — expect only auth.ts, index.ts, hitl.ts
ls src/backend/src/routes/api/*.ts

# Per-agent health
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'
# Expect entries for all 10 active agents, each with skills_configured count + isFrontendFacing flag

# Skills static pathway
# Logs show "[SkillManager] cache HIT" for static skills on second message in session

# Skills dynamic pathway
curl -X POST /agents/OrchestratorAgent/test -H "X-Agent-Skills: brainstorming" -d '...'
# Logs show effectiveSkills including the dynamic "brainstorming" merged with static set

# HITL webhook flow
# POST webhook → 202 returned, new row in hitlQueue with status='pending'
# POST /api/hitl/:id/approve → status='approved', deferred action dispatched

# Chat schema
# Chat with any agent → rows in threads + thread_participants (new) + messages
```

---

## Critical Files Reference

| Area | Path |
|------|------|
| Add `ping()` | `src/backend/src/ai/providers/agent-support/base-agent.ts` |
| Add `verifyChatFormat()` | `src/backend/src/ai/providers/agent-support/base-chat-agent.ts` |
| ResearchAgent fix | `src/backend/src/ai/agents/ResearchAgent/methods/deep-reasoning.ts` |
| GithubAgent fix | `src/backend/src/ai/agents/GithubAgent/index.ts` (line 185–210) |
| GuardrailAgent fix | `src/backend/src/ai/agents/GuardrailAgent/methods/judge.ts` |
| CloudflareAgent new methods | `src/backend/src/ai/agents/CloudflareAgent/methods/{analyze-binding-needs,provision-bindings,validate-implementation}.ts` |
| WorkshopAgent orchestration | `src/backend/src/ai/agents/WorkshopAgent/methods/workshop.ts` |
| GuardrailAgent review | `src/backend/src/ai/agents/GuardrailAgent/methods/judge.ts` |
| HITL routes | `src/backend/src/routes/api/hitl.ts` (new) |
| Webhook HITL | `src/backend/src/routes/api/webhooks/index.ts` |
| Health coordinator | `src/backend/src/health/coordinator.ts` |
| Thread participants schema | `src/backend/src/db/schemas/chats/participants.ts` (new) |
| Chat persistence shared | `src/backend/src/ai/agents/shared/chat-persistence.ts` (new) |
| CollaborationSpace mirroring | `src/backend/src/ai/agents/CollaborationSpace/index.ts` |
| Wrangler | `wrangler.jsonc` |

---

## Execution Order

```
Foundation polish (F1, F2)
   ↓
Agent fixes (A1, A2, A3) — independent, run in parallel
   ↓
CloudflareAgent new methods (A4) — prerequisite for A5, A6
   ↓
WorkshopAgent orchestration (A5) + GuardrailAgent consult (A6) — parallel
   ↓
Cleanup (C1, C2, C3, C4) — C2 is prereq for C3/C4
   ↓
Phase 4 work (I1–I8) — I1+I2 can start early; I8 last; I3 depends on I2
   ↓
Phase 5 chat (I9, I10, I11) — I9 before I10 before I11
   ↓
Final verification
```

Each batch should end with `npx tsc --noEmit` passing and a commit.
