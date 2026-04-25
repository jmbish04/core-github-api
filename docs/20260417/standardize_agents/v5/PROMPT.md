# Coding Agent Prompt — Standardize Agents v5

**Read this entire prompt before writing any code.**  
**Architecture reference:** `docs/20260417/standardize_agents/v5/PLAN.md`  
**Task order:** `docs/20260417/standardize_agents/v5/TASKS.json` — execute tasks in dependency order.

---

## Your Mission

Execute a two-part operation:

**Part 1 (Phases 0–1):** Build the `BaseAgent`/`BaseChatAgent` infrastructure in `ai/providers/agent-support/`. This includes a fully enhanced `SkillManager` with two-pathway skill injection — static (class-level) and dynamic (assistant-ui request header).

**Part 2 (Phases 2–6):** Conform all existing agents to the new base classes, complete post-consolidation cleanup, fix anti-patterns, unify the chat schema, modularize routes, and reset wrangler.

---

## Non-Negotiable Technical Rules

Violation of any of these is a bug. Read all before touching code.

### Rule 1: AIChatAgent from "agents" — not "@cloudflare/ai-chat"
```typescript
import { Agent, AIChatAgent, callable } from "agents"; // ← CORRECT backend imports
import { AIChatAgent } from "@cloudflare/ai-chat";     // ← WRONG (frontend React package)
```

### Rule 2: No live inference in health probes
`verifyChatFormat()` uses static checks only. `AbortSignal.timeout(0)` probe verifies `toUIMessageStreamResponse` is a function without making any network request. No `generateText()`, no `streamText()` with real prompts.

### Rule 3: HITL schema at `db/schemas/workflows/hitl.ts`
```typescript
import { hitlProposals, hitlRevisions, hitlDecisions } from "../../../db/schemas/workflows/hitl";
// DO NOT create db/schemas/agents/hitl.ts — already exists at workflows/hitl.ts
```

### Rule 4: Jules step-2 system prompt from D1
```typescript
const config = await aiProvider.getAgentFunctionConfig(agentName, functionName);
const sys = config?.systemInstructions ?? "Extract into JSON schema. Output only valid JSON.";
```

### Rule 5: AgentStateStore object-param constructor
```typescript
new AgentStateStore({ ctx: this.ctx, env, agentName: this.agentName, initialState: {} });
```

### Rule 6: AIChatAgent hook is `onChatMessage` — not `onMessage`
```typescript
async onChatMessage(onFinish: (messages: any[]) => void) { ... } // ← CORRECT
async onMessage(message: any) { ... }                             // ← WRONG
```

### Rule 7: Long tasks use `keepAliveWhile()`
```typescript
const result = await this.keepAliveWhile(async () => longRunningOperation());
```

### Rule 8: `@callable()` signatures are immutable
Never rename parameters or change types on existing `@callable()` methods.

### Rule 9: Never `agent.fetch(new Request(...))`
Use `@callable()` RPC. Only exception: SSE streaming — document with comment why.

### Rule 10: All AI calls through `this.ai`
No direct vendor imports in agent files. Use `this.ai.generateText(prompt, system, { skills: this.skills })`.

### Rule 11: Grep before deleting any file
Run `grep -rn 'filename' src/` — confirm zero results — then delete.

### Rule 12: OverseerAgent is dissolved, not migrated
Verify EngineerAgent and GuardrailAgent have absorbed all OverseerAgent methods, then dissolve.

---

## Skills Architecture (v5 — Critical New Section)

### Two Pathways

> **IMPORTANT:** `BaseAgent` has full, equal first-class skills support through the Static Pathway. The Dynamic Pathway (X-Agent-Skills header) is the ONLY feature exclusive to `BaseChatAgent`. Backend-only skills (`jules-stitch-loop`, `code-generation`, `pr-review`, `sprint-planning`) belong on `BaseAgent` subclasses — they are never sent from the chat frontend.

**Static (BaseAgent AND BaseChatAgent — identical mechanism):**
```typescript
// BACKEND agent — EngineerAgent executes Jules (implementation only, not the loop)
class EngineerAgent extends BaseAgent {
  protected readonly skills = ['jules-orchestration', 'code-generation', 'code-review'];

  @callable()
  async overseeJules(sessionId: string, designSpecs?: string) {
    // skills prefetched in onStart() — this is always a cache hit
    return this.keepAliveWhile(() =>
      this.ai.generateStructuredResponse(prompt, schema, { skills: this.skills })
    );
  }
}

// BACKEND agent — WorkshopAgent orchestrates the full jules-stitch-loop
class WorkshopAgent extends BaseAgent {
  protected readonly skills = ['workshop-facilitation', 'jules-stitch-loop', 'spec-generation'];

  @callable()
  async runWorkshop(brief: string) {
    // jules-stitch-loop skill tells the AI HOW to orchestrate design + implementation
    const plan = await this.ai.generateStructuredResponse(brief, system, { skills: this.skills });
    // Then calls sub-agents via @callable() RPC — design and implement in sequence
  }
}

// BACKEND agent — DesignAgent executes Stitch (design generation only, not the loop)
class DesignAgent extends BaseAgent {
  protected readonly skills = ['stitch-pipeline', 'ui-design', 'component-spec'];

  @callable()
  async runStitch(brief: string) {
    return this.ai.generateStructuredResponse(brief, system, { skills: this.skills });
  }
}

// CHAT agent — same static mechanism, plus optional dynamic pathway
class OrchestratorAgent extends BaseChatAgent {
  protected readonly skills = ['plan-writing', 'architecture', 'task-management'];
  // onChatMessage() injects skills into systemPrompt automatically
}
```

**Dynamic (BaseChatAgent ONLY — X-Agent-Skills from assistant-ui):**
```
Frontend: POST /agents/OrchestratorAgent/{session}
          Header: X-Agent-Skills: brainstorming,source-evaluation

BaseChatAgent.onRequest() → extracts header → stores in this._requestSkills

BaseChatAgent.onChatMessage() →
  effectiveSkills = this.ai.skills.resolveEffective(this.skills, this._requestSkills)
  // = ['plan-writing', 'architecture', 'task-management', 'brainstorming', 'source-evaluation']
  skillCtx = await this.ai.skills.getSkillInstructions(effectiveSkills) // cache hit
  systemPrompt = [config.systemInstructions, skillCtx].filter(Boolean).join("\n\n")

// BaseAgent subclasses NEVER receive X-Agent-Skills — no HTTP chat endpoint
```

### SkillManager API (What You Are Building)

```typescript
class SkillManager {
  // Core: fetch with in-memory cache (5-minute TTL)
  async getSkillInstructions(skillNames: string[]): Promise<string>

  // Prefetch: fill cache without returning content — called from onStart()
  async prefetch(skillNames: string[]): Promise<void>

  // Validate: check names exist in D1 — warn on missing
  async validate(skillNames: string[]): Promise<{ valid: string[]; missing: string[] }>

  // Merge: deduplicate static + dynamic skills
  resolveEffective(staticSkills: string[], dynamicSkills: string[]): string[]
}
```

### Cache Warming in onStart()

```typescript
// In BOTH BaseAgent and BaseChatAgent onStart() — after agentInit():
if (this.skills.length) {
  this.ctx.waitUntil(
    this.ai.warmSkillCache(this.skills).catch(e =>
      this.logger.warn("Skill cache warm failed (non-fatal):", e)
    )
  );
}
```

### X-Agent-Skills Header Extraction (BaseChatAgent only)

```typescript
// Override in BaseChatAgent — fires BEFORE onChatMessage
async onRequest(request: Request): Promise<Response> {
  const skillHeader = request.headers.get("X-Agent-Skills");
  this._requestSkills = skillHeader
    ? skillHeader.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  return super.onRequest(request); // must call super
}
```

### Skill Injection in methods/generation.ts

```typescript
// At the top of each generation function (6 total):
if (options?.skills?.length) {
  const sm = new SkillManager(ai.env);
  const ctx = await sm.getSkillInstructions(options.skills); // cache hit
  if (ctx) systemPrompt = [systemPrompt, ctx].filter(Boolean).join("\n\n");
} else if ((options as VercelOptions)?.skillContext) {
  // Pre-resolved content bypass — Jules two-step avoids double D1 fetch
  systemPrompt = [systemPrompt, (options as VercelOptions).skillContext].filter(Boolean).join("\n\n");
}
```

### VercelOptions Updates

```typescript
// clients/vercel/types.ts
export interface VercelOptions extends AIOptions {
  maxSteps?: number;
  skillContext?: string; // Pre-resolved skill content — bypasses SkillManager for Jules step 2
}
```

---

## Task Execution Order

### Phase 0 — Audit
**P0-AUDIT** → read-only, no code changes. Document all findings before Phase 1.

### Phase 1 — Foundation (Build in This Order)

1. **P1-TYPES** → `skills?: string[]` to AIOptions + `skillContext?: string` to VercelOptions
2. **P1-SKILLMANAGER-ENHANCED** → Full SkillManager: cache, prefetch, validate, resolveEffective
3. **P1-AI-PROVIDER-SKILLS-API** → Expose `skills: SkillManager` + `warmSkillCache()` on AIProvider
4. **P1-GENERATION** → Two-path skill injection in all 6 generation functions
5. **P1-SKILL-PROTOCOL** → Document X-Agent-Skills protocol in base-chat-agent.ts
6. **P1-JULES-STRUCTURED** → Two-step with D1 system prompt + skillContext bypass
7. **P1-STATE-STORE-MIRROR** → D1 mirror on set/patch
8. **P1-COLLAB-SCHEMA** → collaboration_sessions/participants/events tables
9. **P1-HITL-SERVICE** → HitlQueue (imports from db/schemas/workflows/hitl.ts)
10. **P1-COLLAB-SERVICE** → CollaborationService
11. **P1-BASE-AGENT** → BaseAgent with skill cache warm in onStart()
12. **P1-BASE-CHAT-AGENT** → BaseChatAgent with onRequest() skill extraction + resolveEffective in onChatMessage()
13. **P1-EXPORTS** → Wire all barrel exports
14. **P1-CONFIG-SEED** → Missing agent function config entries

`npx tsc --noEmit` must pass. Commit.

### Phase 2 — Pre-Migration Cleanup (Parallel with Phase 1)
- **A1** → delete 4 legacy flat files (grep first)
- **A2** → create GithubAgent/methods/repo.ts
- **A3** → dissolve OverseerAgent from wrangler and health.ts
- **B1–B4** → unified chat schema (threads/messages/participants → migration)

`npx tsc --noEmit` must pass. Commit.

### Phase 3 — Agent Migration
Depends on Phase 1 + Phase 2. In each agent migration:
- Change extends clause to `BaseAgent` or `BaseChatAgent`
- Add `readonly agentName` and `protected readonly skills`
- `onStart()` → `agentInit()` (agent-specific only)
- Remove duplicate AIProvider/Logger init
- Remove duplicate healthProbe/ping
- Replace `buildSkillContext()` → `options: { skills: this.skills }`
- Replace hardcoded systemPrompt → `this.ai.getAgentFunctionConfig()`

**BaseChatAgent:** OrchestratorAgent, ResearchAgent, CloudflareAgent

> **CloudflareAgent dual-role:** `BaseChatAgent` for user-facing CF investigations, AND exposes `@callable()` methods for backend-agent consultation. Add these three `@callable()` methods to CloudflareAgent during Phase 3 migration:
> - `analyzeBindingNeeds(specs)` → queries CF Docs MCP, returns `bindingDefinitions[]`
> - `provisionBindings(defs)` → creates bindings in CF, returns `wranglerConfigFragment`
> - `validateImplementation(code, bindingConfig)` → CF best-practice check, returns `{ ok, violations[] }`

**BaseAgent (with backend-only skills):**

| Agent | Skills | Jules-Stitch Loop Role |
|-------|--------|------------------------|
| EngineerAgent | `jules-orchestration`, `code-generation`, `code-review` | Executes Jules — receives binding config from CloudflareAgent, passes to Jules |
| GithubAgent | `pr-review`, `code-analysis`, `repo-management` | — |
| GuardrailAgent | `golden-path`, `code-standards`, `cloudflare-standards` | Monitors quality — consults CloudflareAgent.validateImplementation() |
| LearningAgent | `ci-healing`, `incident-analysis`, `root-cause` | — |
| WorkshopAgent | `workshop-facilitation`, `jules-stitch-loop`, `spec-generation` | Orchestrates full loop → Design → CF bindings → Jules → Guardrail → iterate |
| DesignAgent | `stitch-pipeline`, `ui-design`, `component-spec` | Executes Stitch — generates UI mockups/specs |

**Jules-Stitch Loop execution sequence (WorkshopAgent orchestrates):**
1. `DesignAgent.runStitch(brief)` → design specs + binding hints
2. `CloudflareAgent.analyzeBindingNeeds(specs)` → determines D1/KV/R2/AI/Queue needs
3. `CloudflareAgent.provisionBindings(defs)` → creates CF bindings, returns wrangler config
4. `EngineerAgent.overseeJules(session, { designSpecs, bindingConfig })` → Jules implements code + writes wrangler.jsonc bindings
5. `GuardrailAgent.reviewImplementation(prUrl)` → monitors quality; calls `CloudflareAgent.validateImplementation()` for CF-specific checks
6. WorkshopAgent evaluates → loop if needed

> **Jules binding handoff:** EngineerAgent either includes bindingConfig in the initial Jules prompt, or sends a follow-up message to the active Jules session instructing it to add the binding configuration to wrangler.jsonc. Jules then joins bindings to the worker code.

**CollaborationSpace:** Repurposed from ChatRoom/  
**P3-DELETE-SKILL-FETCHER:** After all agents migrated

> All `BaseAgent` subclasses pass `{ skills: this.skills }` in every `this.ai.*` call. The SkillManager cache warming fires in `onStart()` identically for BaseAgent and BaseChatAgent.

`npx tsc --noEmit` must pass. Commit.

### Phase 4 — Integration, Routes, Wrangler Reset
1. **E1** → fresh wrangler v1 migration (16 DO classes including CollaborationSpace)
2. **E2** → export alignment (LearningWorkflow, HitlWorkflow, aliases)
3. **E3** → delete legacy exports, todo_integration/, OverseerAgent/
4. **A4** → fix 16 stale route binding references
5. **D2** → add broadcast/stream/diagnose @callable() methods
6. **D1** → fix 7 anti-pattern agent.fetch() calls (after D2)
7. **P4-WEBHOOK-HITL** → webhooks → HITL propose, 202
8. **P4-HITL-ROUTES** → new routes/api/hitl.ts
9. **P4-HEALTH-COORDINATOR** → per-agent health checks
10. **C1** → move 12 loose route files to categories
11. **C2** → update root router
12. **A5** → `npx wrangler types` + `npx tsc --noEmit` + `npx wrangler deploy --dry-run`

All three commands must pass. Commit.

### Phase 5 — Chat Migration
Depends on Phase 3 + B1–B4:
- **B5** → migrate chat API routes to unified schema
- **B6** → CollaborationSpace D1 mirroring to unified schema
- **B7** → shared/chat-persistence.ts + wire all 9 agents
- **B8** → deprecate old chat schemas

`npx tsc --noEmit` must pass. Commit.

### Phase 6 — Final Verification
**P6-FINAL-VERIFY** → run all 16 success criteria checks (see TASKS.json).

---

## Agent Migration Checklist

```
[ ] extends BaseAgent or BaseChatAgent
[ ] readonly agentName = 'AgentName'
[ ] protected readonly skills = ['skill-a', ...]
[ ] onStart() → agentInit() (agent-specific logic only)
[ ] Remove: import { AIProvider }, import { Logger }
[ ] Remove: this.ai = new AIProvider(...)
[ ] Remove: this.logger = new Logger(...)
[ ] Remove: duplicate healthProbe(), ping()
[ ] Replace: buildSkillContext(env, agentName) → options: { skills: this.skills }
[ ] Replace: hardcoded systemPrompt → this.ai.getAgentFunctionConfig(agentName, method)
[ ] Verify: all @callable() signatures unchanged
[ ] Add: protected async agentHealth() if agent has specific health checks
[ ] Pass: options.skills in every this.ai.* call that uses the agent's skills
[ ] Run: npx tsc --noEmit
```

---

## Key Files Reference

| File | Action | Notes |
|------|--------|-------|
| `ai/providers/types.ts` | MODIFY | Add `skills?: string[]` to AIOptions |
| `ai/providers/clients/vercel/types.ts` | MODIFY | Add `skillContext?: string` to VercelOptions |
| `ai/providers/methods/generation.ts` | MODIFY | Two-path skill injection in all 6 functions |
| `ai/providers/agent-support/skills.ts` | CREATE | Enhanced SkillManager with cache/prefetch/validate |
| `ai/providers/index.ts` | MODIFY | Expose `skills: SkillManager`, `warmSkillCache()` |
| `ai/providers/agent-support/base-agent.ts` | CREATE | Skill cache warm in onStart() |
| `ai/providers/agent-support/base-chat-agent.ts` | CREATE | onRequest() header extraction, resolveEffective in onChatMessage() |
| `ai/providers/agent-support/hitl-queue.ts` | CREATE | Imports from `db/schemas/workflows/hitl.ts` |
| `ai/providers/agent-support/collaboration.ts` | CREATE | CollaborationService |
| `ai/providers/agent-support/state-store.ts` | MODIFY | D1 mirror on set/patch |
| `ai/providers/vendors/jules.ts` | MODIFY | Two-step + skillContext bypass |
| `ai/providers/agent-support/index.ts` | MODIFY | Barrel exports |
| `db/schemas/agents/collaborations.ts` | CREATE | collaboration tables |
| `db/schemas/workflows/hitl.ts` | **EXISTING — DO NOT RECREATE** | Import from here |
| `db/schemas/agents/mirror.ts` | **EXISTING — DO NOT RECREATE** | agentStateMirror |
| `db/schemas/chats/threads.ts` | MODIFY | Add agent/source columns |
| `db/schemas/chats/messages.ts` | MODIFY | Add metadata |
| `db/schemas/chats/participants.ts` | CREATE | thread_participants |
| `db/schema.core.ts` | MODIFY | Add chats export |
| `db/services/agent-config/seed.ts` | MODIFY | Missing entries |
| `ai/agents/CollaborationSpace/index.ts` | CREATE | Renamed from ChatRoom/ |
| `ai/agents/GithubAgent/methods/repo.ts` | CREATE | From todo_integration/Repo.ts |
| `do/JulesWebhookBroadcaster.ts` | MODIFY | Add broadcast() @callable |
| `routes/api/webhooks/index.ts` | MODIFY | HITL propose |
| `routes/api/hitl.ts` | CREATE | HITL CRUD routes |
| `routes/api/frontend/ai/chat.ts` | MODIFY | Unified chat schema |
| `health/coordinator.ts` | MODIFY | Per-agent health checks |
| `wrangler.jsonc` | MODIFY | Fresh v1 migration reset |
| `workflows/exports.ts` | MODIFY | Add LearningWorkflow |

## Files to Delete

| File | Phase | Pre-condition |
|------|-------|--------------|
| `ai/agents/ChatRoom.ts` | 2 | grep → zero imports |
| `ai/agents/WorkshopAgent/CfAgentsSdk.ts` | 2 | grep → zero imports |
| `ai/agents/WorkshopAgent/UxResearcher.ts` | 2 | grep → zero imports |
| `ai/agents/WorkshopAgent/WorkshopAgent.ts` | 2 | grep → zero imports |
| `services/octokit/skill-fetcher.ts` | 3 | All agents migrated, grep → zero imports |
| `ai/agents/OverseerAgent/` (directory) | 4 | Wrangler reset complete |
| All `todo_integration/` dirs (28 files) | 4 | Wrangler reset complete |

---

## Verification Commands

```bash
# Every phase — zero errors required:
npx tsc --noEmit

# Phase 4 — all three required:
npx wrangler types
npx wrangler deploy --dry-run

# Stale bindings (after A4):
grep -r "GEMINI_AGENT\|DEEP_RESEARCH_CHAT_AGENT\|SUPERVISOR\|WEB_SEARCH_AGENT\|JUDGE_AGENT\|TOPIC_ORCHESTRATOR\|JULES_OVERSEER\|CLOUDFLARE_DOCS_AGENT\|OVERSEEER_AGENT" \
  src/backend/src/routes src/backend/src/workflows

# Anti-patterns (after D1):
grep -rn "\.fetch(new Request(" src/backend/src/routes

# Skills — static pathway:
# Trigger OrchestratorAgent.submitBrief
# Worker logs: "[SkillManager] Cache HIT for: plan-writing, architecture, task-management"
# Worker logs: "<skill_context>" in systemPrompt

# Skills — dynamic pathway:
curl -X POST /agents/OrchestratorAgent/test \
  -H "X-Agent-Skills: brainstorming,source-evaluation" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
# Worker logs: "[BaseChatAgent] Effective skills: ..." with merged+deduped list

# Skills — cache TTL:
# Send 2 messages in same session
# Second message Worker logs: "[SkillManager] Cache HIT" (no D1 call)

# Skills — unknown name:
# Pass X-Agent-Skills: nonexistent-skill → Worker logs warn, response continues

# Health includes skill count:
curl /health | jq '.checks | map(select(.name | startswith("agent:")))[0].detail'
# Must include "skills_configured:3" for OrchestratorAgent

# Jules skillContext bypass:
# generateStructuredResponse with provider='jules'
# Worker logs for step 2: NO "[SkillManager] D1 fetch" message (uses skillContext bypass)

# Health endpoint:
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'
# OrchestratorAgent, ResearchAgent, CloudflareAgent → isFrontendFacing: true, assistant_ui_stream_compatible
# EngineerAgent, GithubAgent... → isFrontendFacing: false

# Chat schema:
# SELECT * FROM threads WHERE hostAgentId='OrchestratorAgent' → row exists
# SELECT * FROM thread_participants → host row for OrchestratorAgent

# Route cleanup:
ls src/backend/src/routes/api/*.ts
# Should show: auth.ts, index.ts, hitl.ts only

# Migration:
pnpm run migrate:local
```
