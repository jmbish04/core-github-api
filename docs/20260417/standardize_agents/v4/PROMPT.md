# Coding Agent Prompt — Standardize Agents v4

**Read this entire prompt before writing any code.**  
**Architecture reference:** `docs/20260417/standardize_agents/v4/PLAN.md`  
**Task order:** `docs/20260417/standardize_agents/v4/TASKS.json` — execute tasks in dependency order.

---

## Your Mission

You are executing a two-part operation:

**Part 1 (Phases 0–1):** Build the BaseAgent/BaseChatAgent infrastructure in `ai/providers/agent-support/`. This is the shared foundation every agent inherits from — AIProvider, Logger, AgentStateStore, EdigraphMemory, SkillManager, HitlQueue, CollaborationService — all initialized once in `onStart()`, never duplicated.

**Part 2 (Phases 2–6):** Conform all existing agents to this infrastructure, complete post-consolidation cleanup, fix anti-patterns, unify the chat schema, modularize routes, and reset wrangler to a clean state.

---

## Non-Negotiable Technical Rules

Violation of any of these rules is a bug. Read them before touching any file.

### Rule 1: AIChatAgent import is from "agents" — not "@cloudflare/ai-chat"
```typescript
// CORRECT — backend agent class:
import { Agent, AIChatAgent, callable } from "agents";

// WRONG — this is a frontend-only React package:
import { AIChatAgent } from "@cloudflare/ai-chat";
```
`@cloudflare/ai-chat` contains only the `useAgentChat` React hook. It is never imported in backend agent files.

### Rule 2: No live inference in health probes
`verifyChatFormat()` in BaseChatAgent must use **static checks only**. No `generateText()`, no `streamText()` with real prompts, no `fetch()` to AI APIs.
- ✅ Check `env.AI` binding exists
- ✅ Check `Array.isArray(this.messages)`
- ✅ Use `AbortSignal.timeout(0)` to verify `toUIMessageStreamResponse` is a function (cancels before any network call)
- ❌ Do NOT call any inference API in a health check

Why: the health coordinator calls all agents in parallel. Live inference in health checks exhausts rate limits and creates cascade failure.

### Rule 3: HITL schema is at db/schemas/workflows/hitl.ts
```typescript
import { hitlProposals, hitlRevisions, hitlDecisions } from "../../../db/schemas/workflows/hitl";
```
If you create `db/schemas/agents/hitl.ts`, you've made an error. The workflows/hitl.ts file already exists.

### Rule 4: Jules step-2 system prompt from D1
```typescript
const config = await aiProvider.getAgentFunctionConfig(agentName, functionName);
const sys = config?.systemInstructions ?? "Extract into JSON schema. Output only valid JSON.";
```
Never hardcode instructions as a string literal in jules.ts.

### Rule 5: AgentStateStore uses object-param constructor
```typescript
// CORRECT:
new AgentStateStore({ ctx: this.ctx, env, agentName: this.agentName, initialState: {} });

// WRONG — positional params:
new AgentStateStore(this.ctx, this.env, this.agentName);
```

### Rule 6: AIChatAgent message hook is onChatMessage — not onMessage
```typescript
async onChatMessage(onFinish: (messages: any[]) => void) { ... }  // ← CORRECT
async onMessage(message: any) { ... }                              // ← WRONG (raw WebSocket)
```

### Rule 7: Long tasks must use keepAliveWhile()
Durable Objects evict after 70–140s of inactivity. Jules sessions, research pipelines, and multi-step workflows must wrap the blocking operation:
```typescript
const result = await this.keepAliveWhile(async () => longRunningOperation());
```
`keepAliveWhile()` is inherited from `Agent` — do not re-implement it.

### Rule 8: @callable() signatures are immutable
Never rename, add, or remove parameters on any `@callable()` method. Routes, Workflows, and frontend hooks depend on them.

### Rule 9: Never agent.fetch(new Request(...))
All agent-to-agent calls use `@callable()` RPC: `const result = await stub.myMethod(args)`. The ONLY allowed exception: SSE streaming endpoints where `@callable()` cannot return a stream. If you make this exception, document it with a comment explaining why `onRequest` is the intentional fallback.

### Rule 10: All AI calls through this.ai
No direct vendor imports in agent files. Always use `this.ai.generateText(...)`, `this.ai.generateStructuredResponse(...)`, etc.

### Rule 11: Grep before deleting
Before deleting any file, run `grep -rn 'filename' src/` and confirm zero import sites. If imports exist, fix them first.

### Rule 12: OverseerAgent is dissolved — do not migrate it
OverseerAgent's responsibilities have been absorbed: Jules oversight → EngineerAgent, Judge/validate → GuardrailAgent. Verify these methods exist in Phase 0 audit. Then dissolve OverseerAgent from active wrangler bindings in Phase 2. Delete the directory in Phase 4 only after wrangler migration reset.

---

## Task Tracking Protocol

- Before starting any task: read its entry in TASKS.json
- After completing a task: verify ALL `success_criteria` pass
- Run `npx tsc --noEmit` at the end of every phase
- Do not proceed to the next phase with type errors
- Report a task as complete ONLY when every success criterion is met

---

## Execution Order

### Phase 0 — Audit (No Code Changes)
**P0-AUDIT**: Grep all agent method files. Document: hardcoded prompts, providers, models, JSON-returning generateText calls, buildSkillContext sites, custom onStart() logic, OverseerAgent method coverage.

### Phase 1 — Foundation (ai/providers layer)
Execute in dependency order:
1. **P1-TYPES** → add `skills?: string[]` to AIOptions
2. **P1-SKILLMANAGER** → `agent-support/skills.ts`
3. **P1-GENERATION** → skill injection in all 6 generation methods
4. **P1-JULES-STRUCTURED** → two-step with D1 system prompt
5. **P1-STATE-STORE-MIRROR** → D1 mirror on set/patch
6. **P1-COLLAB-SCHEMA** → `db/schemas/agents/collaborations.ts`
7. **P1-HITL-SERVICE** → `agent-support/hitl-queue.ts` (imports from workflows/hitl.ts)
8. **P1-COLLAB-SERVICE** → `agent-support/collaboration.ts`
9. **P1-BASE-AGENT** → `agent-support/base-agent.ts`
10. **P1-BASE-CHAT-AGENT** → `agent-support/base-chat-agent.ts` (AIChatAgent from "agents")
11. **P1-EXPORTS** → wire barrel exports
12. **P1-CONFIG-SEED** → add missing seed entries

After Phase 1: `npx tsc --noEmit` must pass. Commit.

### Phase 2 — Pre-Migration Cleanup (Parallel with Phase 1)
These have no foundation dependency — can be worked in parallel:
- **A1-DELETE-LEGACY-FLAT** → delete 4 legacy flat agent files (grep first)
- **A2-GITHUB-REPO-TS** → create GithubAgent/methods/repo.ts from todo_integration/Repo.ts
- **A3-DISSOLVE-OVERSEER** → remove OverseerAgent from active wrangler bindings and health.ts
- **B1-THREADS-SCHEMA** → extend threads table (hostAgentId, roomId, source, userId)
- **B2-MESSAGES-SCHEMA** → add metadata column to messages
- **B3-PARTICIPANTS-TABLE** → create thread_participants table
- **B4-CHAT-SCHEMA-MIGRATION** → export chats schema, generate D1 migration, test locally

After Phase 2: `npx tsc --noEmit` must pass. Commit.

### Phase 3 — Agent Migration
Depends on Phase 1 + Phase 2. Migrate each agent in parallel where dependencies allow:

**BaseChatAgent agents** (frontend chat):
- **P3-ORCHESTRATOR** → OrchestratorAgent, skills: plan-writing/architecture/task-management
- **P3-RESEARCH** → ResearchAgent, skills: deep-research/brainstorming/source-evaluation
- **P3-CLOUDFLARE** → CloudflareAgent, skills: cloudflare-docs/workers-architecture/debugging

**BaseAgent agents** (backend):
- **P3-ENGINEER** → EngineerAgent (keepAliveWhile on Jules, absorbs checkSchedule/ingestEvent)
- **P3-GITHUB** → GithubAgent (repo.ts already created in A2)
- **P3-GUARDRAIL** → GuardrailAgent (absorbs judgeCodeQuality/evaluate/validate)
- **P3-LEARNING** → LearningAgent
- **P3-WORKSHOP** → WorkshopAgent
- **P3-DESIGN** → DesignAgent

**Infrastructure**:
- **P3-COLLAB-SPACE** → rename ChatRoom/ → CollaborationSpace/, implement 6 RPC methods
- **P3-DELETE-SKILL-FETCHER** → delete services/octokit/skill-fetcher.ts (after all agents migrated)

After Phase 3: `npx tsc --noEmit` must pass. Commit.

### Phase 4 — Integration, Routes, and Wrangler Reset
Depends on Phase 3. This phase is large — work in logical order:

1. **E1-WRANGLER-RESET** → fresh single v1 migration (all 16 DO classes including CollaborationSpace)
2. **E2-EXPORT-ALIGNMENT** → LearningWorkflow export, HitlWorkflow decision, alias verification
3. **E3-DELETE-LEGACY** → remove legacy exports section from exports.ts, delete todo_integration/ dirs, delete OverseerAgent/
4. **A4-STALE-ROUTES** → fix 16 stale binding references in routes/ and workflows/
5. **D2-CALLABLE-METHODS** → add broadcast/stream/diagnose @callable() methods
6. **D1-ANTI-PATTERNS** → fix 7 agent.fetch(new Request(...)) calls (after D2)
7. **P4-WEBHOOK-HITL** → webhooks → HITL propose, return 202
8. **P4-HITL-ROUTES** → new routes/api/hitl.ts
9. **P4-HEALTH-COORDINATOR** → per-agent health checks in coordinator
10. **C1-ROUTE-MODULARIZATION** → move 12 loose route files to category dirs
11. **C2-ROOT-ROUTER** → update imports in routes/api/index.ts
12. **A5-TYPE-REGEN** → npx wrangler types + npx tsc --noEmit + npx wrangler deploy --dry-run

After Phase 4: all three verification commands must pass. Commit.

### Phase 5 — Chat Migration
Depends on Phase 3 + Phase 2 B1-B4:
- **B5-CHAT-ROUTES** → migrate routes/api/frontend/ai/chat.ts to unified schema
- **B6-COLLAB-MIRRORING** → CollaborationSpace D1 mirroring to unified schema
- **B7-AGENT-CHAT-INTEGRATION** → create shared/chat-persistence.ts, wire all agents
- **B8-DEPRECATE-OLD-SCHEMA** → deprecate agents/chat.ts and chatRoomLogs

After Phase 5: `npx tsc --noEmit` must pass. Commit.

### Phase 6 — Final Verification
- **P6-FINAL-VERIFY** → run all 13 checks from PLAN.md verification section

---

## Per-Agent Migration Quick Reference

For each agent, apply this checklist:

```
[ ] Change extends clause to BaseAgent or BaseChatAgent
[ ] Add: readonly agentName = 'AgentName'
[ ] Add: protected readonly skills = ['skill-a', 'skill-b']
[ ] Rename onStart() → agentInit() (keep ONLY agent-specific logic)
[ ] Remove: import { AIProvider } from ...
[ ] Remove: import { Logger } from ...
[ ] Remove: this.ai = new AIProvider(...)
[ ] Remove: this.logger = new Logger(...)
[ ] Remove: duplicate healthProbe() — inherited
[ ] Remove: duplicate ping() — inherited
[ ] Replace: buildSkillContext(env, agentName) → options: { skills: this.skills }
[ ] Replace: hardcoded systemPrompt → await this.ai.getAgentFunctionConfig(agentName, method)
[ ] Verify: all @callable() signatures unchanged
[ ] Add: protected async agentHealth() if agent has specific health checks
[ ] Run: npx tsc --noEmit
```

---

## Key Binding Migration Reference

For stale route fixes (A4-STALE-ROUTES):

| Old Binding | New Binding | New Method |
|-------------|-------------|------------|
| GEMINI_AGENT | ORCHESTRATOR | .chat() |
| CLOUDFLARE_DOCS_AGENT | CLOUDFLARE_AGENT | .chat() |
| DEEP_RESEARCH_CHAT_AGENT | RESEARCH_AGENT | .deepDive() |
| SUPERVISOR | ORCHESTRATOR | .healthProbe() |
| WEB_SEARCH_AGENT | RESEARCH_AGENT | .puppeteerSearch() |
| JUDGE_AGENT | GUARDRAIL_AGENT | .judgeCodeQuality() |
| TOPIC_ORCHESTRATOR | RESEARCH_AGENT | .topicResearch() |
| JULES_OVERSEER | ENGINEER_AGENT | .overseeJules() |

---

## Key Files Reference

| File | Action | Notes |
|------|--------|-------|
| `ai/providers/types.ts` | MODIFY | Add skills?: string[] to AIOptions |
| `ai/providers/methods/generation.ts` | MODIFY | Skill injection in all 6 methods |
| `ai/providers/agent-support/skills.ts` | CREATE | SkillManager (D1-backed) |
| `ai/providers/agent-support/base-agent.ts` | CREATE | BaseAgent abstract |
| `ai/providers/agent-support/base-chat-agent.ts` | CREATE | import from "agents" not "@cloudflare/ai-chat" |
| `ai/providers/agent-support/hitl-queue.ts` | CREATE | imports from db/schemas/workflows/hitl.ts |
| `ai/providers/agent-support/collaboration.ts` | CREATE | CollaborationService |
| `ai/providers/agent-support/state-store.ts` | MODIFY | D1 mirror on set/patch |
| `ai/providers/vendors/jules.ts` | MODIFY | Two-step with D1 system prompt |
| `ai/providers/agent-support/index.ts` | MODIFY | Export all new classes |
| `ai/providers/index.ts` | MODIFY | Re-export BaseAgent, BaseChatAgent |
| `db/schemas/agents/collaborations.ts` | CREATE | collaboration_sessions/participants/events |
| `db/schemas/workflows/hitl.ts` | **EXISTING — DO NOT RECREATE** | Import from here |
| `db/schemas/agents/mirror.ts` | **EXISTING — DO NOT RECREATE** | agentStateMirror already here |
| `db/schemas/chats/threads.ts` | MODIFY | Add agent/source columns (B1) |
| `db/schemas/chats/messages.ts` | MODIFY | Add metadata (B2) |
| `db/schemas/chats/participants.ts` | CREATE | thread_participants (B3) |
| `db/schema.core.ts` | MODIFY | Add chats export (B4) |
| `db/services/agent-config/seed.ts` | MODIFY | Missing agent/function entries |
| `ai/agents/CollaborationSpace/index.ts` | CREATE | Renamed from ChatRoom/ |
| `ai/agents/exports.ts` | MODIFY | Remove legacy section (E3), add CollaborationSpace |
| `ai/agents/GithubAgent/methods/repo.ts` | CREATE | Extracted from todo_integration/Repo.ts |
| `do/JulesWebhookBroadcaster.ts` | MODIFY | Add broadcast() @callable |
| `routes/api/webhooks/index.ts` | MODIFY | HITL propose instead of auto-trigger |
| `routes/api/hitl.ts` | CREATE | HITL CRUD routes |
| `routes/api/frontend/ai/chat.ts` | MODIFY | Unified chat schema (B5) |
| `health/coordinator.ts` | MODIFY | Per-agent health checks |
| `wrangler.jsonc` | MODIFY | Fresh v1 migration reset |
| `workflows/exports.ts` | MODIFY | Add LearningWorkflow export |

## Files to Delete

| File | Phase | Pre-condition |
|------|-------|--------------|
| `ai/agents/ChatRoom.ts` | 2 (A1) | grep confirms zero imports |
| `ai/agents/WorkshopAgent/CfAgentsSdk.ts` | 2 (A1) | grep confirms zero imports |
| `ai/agents/WorkshopAgent/UxResearcher.ts` | 2 (A1) | grep confirms zero imports |
| `ai/agents/WorkshopAgent/WorkshopAgent.ts` | 2 (A1) | grep confirms zero imports |
| `services/octokit/skill-fetcher.ts` | 3 | All agents migrated, grep confirms zero imports |
| `ai/agents/OverseerAgent/` (directory) | 4 (E3) | Wrangler reset complete |
| All `todo_integration/` dirs (28 files) | 4 (E3) | Wrangler reset complete |

---

## Verification Commands (Run After Each Phase)

```bash
# TypeScript — zero errors (every phase)
npx tsc --noEmit

# After Phase 4:
npx wrangler types
npx wrangler deploy --dry-run

# Stale bindings — zero matches (after A4)
grep -r "GEMINI_AGENT\|DEEP_RESEARCH_CHAT_AGENT\|SUPERVISOR\|WEB_SEARCH_AGENT\|JUDGE_AGENT\|TOPIC_ORCHESTRATOR\|JULES_OVERSEER\|CLOUDFLARE_DOCS_AGENT\|OVERSEEER_AGENT" src/backend/src/routes src/backend/src/workflows

# Anti-patterns — zero matches (after D1)
grep -rn "\.fetch(new Request(" src/backend/src/routes

# Health endpoint — all 9 agents
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'

# Export alignment (after E2)
# Extract each class_name from wrangler.jsonc → confirm export exists

# Chat schema (after B5)
# Chat with OrchestratorAgent → SELECT * FROM threads WHERE hostAgentId='OrchestratorAgent' → row exists
# SELECT * FROM thread_participants → host row exists

# D1 migration
pnpm run migrate:local

# Loose route files — only auth.ts, index.ts, hitl.ts remain
ls src/backend/src/routes/api/*.ts
```
