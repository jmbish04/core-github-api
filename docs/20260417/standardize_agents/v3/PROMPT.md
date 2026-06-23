# Coding Agent Prompt — Standardize Agents v3

**Read this entire prompt before writing any code.**  
**Architecture reference:** `docs/20260417/standardize_agents/v3/PLAN.md`  
**Task order:** `docs/20260417/standardize_agents/v3/TASKS.json` — execute tasks in dependency order.

---

## Your Mission

Implement a comprehensive standardization of the Cloudflare Agents SDK backend in `src/backend/src/ai/`. Every agent inherits the same base class (`BaseAgent` or `BaseChatAgent`) and shares the same AIProvider, Logger, StateStore, EdigraphMemory, SkillManager, CollaborationService, and HitlQueue infrastructure — with zero inconsistency.

---

## Critical Technical Constraints (Non-Negotiable)

### 1. Import paths for agent base classes
```typescript
// CORRECT — backend agent classes:
import { Agent, AIChatAgent, callable } from "agents";

// WRONG — do NOT use this for backend code:
import { AIChatAgent } from "@cloudflare/ai-chat"; // ← frontend-only (React useAgentChat hook)
```
`@cloudflare/ai-chat` is exclusively for the frontend. `AIChatAgent` used in backend agent files must be imported from `"agents"`.

### 2. No live inference in health probes
`verifyChatFormat()` in `BaseChatAgent` must be **static checks only**:
- ✅ Check `env.AI` binding is defined
- ✅ Check `Array.isArray(this.messages)` 
- ✅ Verify `toUIMessageStreamResponse` is a function via `AbortSignal.timeout(0)` probe (aborts immediately — no actual inference)
- ❌ Do NOT call `generateText(...)` with a real prompt
- ❌ Do NOT call `streamText(...)` with a real model and real tokens
- ❌ Do NOT make any fetch() calls to AI endpoints

Reason: the health coordinator calls all 10 agents' `healthProbe()` in parallel. Live inference in health checks exhausts rate limits and creates cascade failure.

### 3. HITL schema path
The HITL D1 schema **already exists** at `db/schemas/workflows/hitl.ts`. Do NOT create a new schema file. Import from there:
```typescript
import { hitlProposals, hitlRevisions, hitlDecisions } from "../../../db/schemas/workflows/hitl";
```
If you create `db/schemas/agents/hitl.ts`, you have made an error. Delete it.

### 4. Jules step-2 system prompt from D1
In `vendors/jules.ts`, the Workers AI structuring step must load its system prompt from D1:
```typescript
const config = await aiProvider.getAgentFunctionConfig(agentName, functionName);
const structuringSystemPrompt = config?.systemInstructions ?? "Extract and format the input text into the JSON schema provided. Output only valid JSON.";
```
Never hardcode instructions like `"Parse the following content into..."` as a string literal in the source file.

### 5. AgentStateStore constructor signature
```typescript
// CORRECT — object param:
this.store = new AgentStateStore({ ctx: this.ctx, env, agentName: this.agentName, initialState: {} });

// WRONG — positional params:
this.store = new AgentStateStore(this.ctx, this.env, this.agentName);
```

### 6. AIChatAgent message hook
```typescript
// CORRECT:
async onChatMessage(onFinish: (messages: any[]) => void) { ... }

// WRONG:
async onMessage(message: any) { ... }   // ← raw WebSocket hook, not chat hook
```

### 7. Long-running tasks must use keepAliveWhile()
Durable Objects evict after 70–140s of inactivity. Any method that runs a Jules session, research pipeline, or multi-step workflow must wrap the operation:
```typescript
const result = await this.keepAliveWhile(async () => {
  return await longRunningOperation();
});
```
`keepAliveWhile()` is inherited from `Agent` — do not re-implement it.

### 8. Do not change @callable() method signatures
Routes, Workflow entrypoints, and frontend hooks all depend on public method names and parameter types. Never rename or change the signature of any `@callable()` method.

---

## Ground Rules

1. **Start with the audit (TASK P0-AUDIT).** Grep every agent's method files before writing code. Document hardcoded prompts, providers, models, and generateText-that-returns-JSON. This drives seed.ts entries.

2. **Execute tasks in dependency order** per `depends_on` in TASKS.json.

3. **Commit after each phase** (Phase 0 through 3). Each commit must compile with zero TypeScript errors.

4. **`npx tsc --noEmit` at every phase boundary.** Do not proceed to the next phase with type errors.

5. **Never delete a file without grep confirmation it has zero import sites.** Grep first, then delete.

6. **Preserve all agent-specific `onStart()` logic inside `agentInit()`.** DDL migrations, cache warm, D1 state recovery — do not discard these.

---

## What You Are Building

### Phase 0 — Audit (Read-Only)
Grep all agent method files. Find and document:
- Hardcoded `systemPrompt` strings → need entries in `seed.ts`
- Hardcoded provider/model strings → need entries in `seed.ts`
- `generateText()` calls expecting JSON output → convert to `generateStructuredResponse`
- All `buildSkillContext()` import and call sites → removed in Phase 2

### Phase 1 — Foundation (ai/providers layer)
- `P1-TYPES`: `skills?: string[]` in AIOptions
- `P1-SKILLMANAGER`: `agent-support/skills.ts` — D1-backed SkillManager
- `P1-GENERATION`: Skill injection in all 6 generation methods
- `P1-JULES-STRUCTURED`: Two-step in `vendors/jules.ts` with D1 system prompt
- `P1-BASE-AGENT`: `agent-support/base-agent.ts`
- `P1-BASE-CHAT-AGENT`: `agent-support/base-chat-agent.ts` — import from `"agents"`, static verifyChatFormat
- `P1-STATE-STORE-MIRROR`: D1 mirror on `set()` and `patch()`
- `P1-COLLAB-SERVICE`: `agent-support/collaboration.ts` + `db/schemas/agents/collaborations.ts`
- `P1-HITL-SERVICE`: `agent-support/hitl-queue.ts` — imports from `db/schemas/workflows/hitl.ts`
- `P1-EXPORTS`: Barrel exports in `agent-support/index.ts` and `providers/index.ts`
- `P1-CONFIG-SEED`: Missing entries in `db/services/agent-config/seed.ts`

### Phase 2 — Agent Migration
For each agent:
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
  protected readonly skills = ['skill-a'];
  
  protected async agentInit() {
    // ONLY agent-specific init (DDL, cache warm, state recovery)
  }
  // healthProbe() and ping() are inherited — do NOT duplicate
  
  protected async agentHealth() {
    return ['custom_check:ok'];
  }
}
```

**BaseChatAgent agents** (frontend chat): OrchestratorAgent, ResearchAgent, CloudflareAgent  
**BaseAgent agents** (backend): EngineerAgent, GithubAgent, GuardrailAgent, LearningAgent, WorkshopAgent, DesignAgent, OverseerAgent  
**CollaborationSpace**: Repurposed from `ChatRoom/index.ts` — extends BaseChatAgent, all 6 RPC methods

After migration:
- Delete `ai/agents/ChatRoom.ts` (confirm no imports first)
- Delete `services/octokit/skill-fetcher.ts` (confirm no imports first)

### Phase 3 — Integration
- **P3-WEBHOOK-HITL**: Webhook handler → HITL propose instead of auto-trigger, return 202
- **P3-HITL-ROUTES**: New `routes/api/hitl.ts` — GET list, POST approve/reject/iterate
- **P3-HEALTH-COORDINATOR**: Per-agent checks in `health/coordinator.ts`
- **P3-COMPILE-CHECK**: `npx tsc --noEmit` + `pnpm run dry-run` — both must pass

---

## Key Files Reference

| File | Action | Note |
|------|--------|------|
| `ai/providers/types.ts` | MODIFY | Add `skills?: string[]` to AIOptions |
| `ai/providers/methods/generation.ts` | MODIFY | Skill injection in all 6 methods |
| `ai/providers/agent-support/skills.ts` | CREATE | SkillManager (D1-backed) |
| `ai/providers/agent-support/base-agent.ts` | CREATE | BaseAgent abstract |
| `ai/providers/agent-support/base-chat-agent.ts` | CREATE | BaseChatAgent — import from `"agents"` |
| `ai/providers/agent-support/hitl-queue.ts` | CREATE | Imports from `db/schemas/workflows/hitl.ts` |
| `ai/providers/agent-support/collaboration.ts` | CREATE | CollaborationService |
| `ai/providers/agent-support/state-store.ts` | MODIFY | Add D1 mirror |
| `ai/providers/vendors/jules.ts` | MODIFY | Two-step with D1 system prompt |
| `ai/providers/agent-support/index.ts` | MODIFY | Export all new classes |
| `ai/providers/index.ts` | MODIFY | Re-export BaseAgent, BaseChatAgent |
| `db/schemas/agents/collaborations.ts` | CREATE | collaboration_sessions/participants/events |
| `db/schemas/workflows/hitl.ts` | **EXISTING — DO NOT RECREATE** | Import from here only |
| `db/schemas/agents/mirror.ts` | **EXISTING — DO NOT RECREATE** | agentStateMirror already here |
| `db/services/agent-config/seed.ts` | MODIFY | Add missing agent/function entries |
| `ai/agents/CollaborationSpace/index.ts` | CREATE | Repurposed from ChatRoom |
| `ai/agents/exports.ts` | MODIFY | Update ChatRoom → CollaborationSpace |
| `routes/api/webhooks/index.ts` | MODIFY | HITL propose instead of auto-trigger |
| `routes/api/hitl.ts` | CREATE | HITL CRUD routes |
| `health/coordinator.ts` | MODIFY | Per-agent health checks |

## Files to Delete (After Confirming Zero Imports)

| File | Replaced By |
|------|-------------|
| `ai/agents/ChatRoom.ts` | CollaborationSpace/index.ts |
| `services/octokit/skill-fetcher.ts` | SkillManager in agent-support/skills.ts |

---

## Verification Checklist

```bash
# 1. Zero TypeScript errors
npx tsc --noEmit

# 2. Dry-run deployment success (all DO bindings resolve)
pnpm run dry-run

# 3. Health endpoint — all agents present
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'
# Frontend agents: must include "assistant_ui_stream_compatible" in capabilities
# All agents: isFrontendFacing correct (true for Orchestrator/Research/Cloudflare)

# 4. Skill injection — trigger OrchestratorAgent.submitBrief
# Worker logs must show <skill_context> block in systemPrompt

# 5. Jules two-step — call generateStructuredResponse with provider='jules'
# Worker logs must show: Jules step 1 text, then Workers AI structuring step
# Step 2 system prompt must come from D1 getAgentFunctionConfig (not hardcoded)

# 6. CollaborationSpace round-trip
# EngineerAgent.openCollaboration() → SELECT * FROM collaboration_sessions returns row
# triggerCollaborator() → SELECT * FROM collaboration_events returns row

# 7. HITL round-trip
# POST /api/webhooks with pull_request event → 202 response, SELECT * FROM hitl_proposals returns pending row
# POST /api/hitl/:id/approve → SELECT * FROM hitl_decisions returns approved row

# 8. Frontend chat (BaseChatAgent agents only)
# assistant-ui → OrchestratorAgent → streaming response (no spinner hang)
# healthProbe.capabilities includes "assistant_ui_stream_compatible"
```
