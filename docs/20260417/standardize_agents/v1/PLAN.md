# Standardize Agents — Master Implementation Plan

**Date:** 2026-04-17  
**Scope:** `src/backend/src/ai/` — providers layer + all agents  
**Branch:** `feat/standardize-agents-v1`

---

## 1. Context & Problem Statement

The agentic backend has 11 Cloudflare Agents SDK agents with wildly inconsistent internals. The `ai/providers` package is the intended single source of truth for all AI operations but is not fully leveraged by agents.

### Current Inconsistencies (Audit Results)

| Agent | Base Class | AIProvider | Logger | StateStore | Edigraph | ensureReady | Config | Skills |
|-------|-----------|-----------|--------|-----------|---------|------------|--------|--------|
| OrchestratorAgent | AIChatAgent | ✅ onStart | ❌ inline | ❌ | ❌ | ❌ | partial | partial |
| EngineerAgent | AIChatAgent | ✅ onStart | ❌ inline | ❌ | ❌ | ❌ | partial | partial |
| GithubAgent | AIChatAgent | ✅ onStart | ✅ onStart | ✅ | ❌ | ✅ | partial | ❌ |
| GuardrailAgent | AIChatAgent | ✅ onStart | ❌ inline | ❌ | ❌ | ❌ | partial | partial |
| ResearchAgent | AIChatAgent | ✅ onStart | ❌ none | ❌ | ❌ | ❌ | partial | partial |
| OverseerAgent | AIChatAgent | ✅ onStart | ❌ console.log | ❌ | ❌ | ❌ | ❌ | ❌ |
| CloudflareAgent | Agent | ✅ onStart | ✅ onStart | ✅ | ❌ | ✅ | partial | partial |
| DesignAgent | Agent | ✅ onStart | ✅ onStart | ❌ | ❌ | ✅ | ❌ | ✅ |
| WorkshopAgent | Agent | ✅ onStart | ❌ via store | ✅ | ❌ | ✅ | ❌ | partial |
| LearningAgent | Agent | ❌ none | ❌ inline | ❌ | ❌ | ❌ | ❌ | partial |
| ChatRoom | AIChatAgent | ❌ none | ❌ inline | ❌ | ✅ | ❌ | ❌ | ❌ |

**Additional issues:**
- `skill-fetcher.ts` loads skills from GitHub at runtime (slow, network-dependent) — D1 is the correct source via `agent_skills` table
- Root `ChatRoom.ts` (203 lines) and `ChatRoom/index.ts` (158 lines) are duplicate implementations — root is legacy and not in `exports.ts`
- `ChatRoom` concept conflated with: (a) frontend chat interface, and (b) agent collaboration infrastructure — needs disambiguation
- Only 24 seed entries in `agent_function_configs`; most agents ignore the config service and hardcode prompts
- Several agents use `generateText` with JSON-instructed prompts — should use `generateStructuredResponse`

---

## 2. Architecture Decisions

### 2.1 Agent Topology — Frontend vs Backend

`Agent<Env>` vs `AIChatAgent<Env>` is a real distinction in Cloudflare Agents SDK:
- **`AIChatAgent<Env>`** — adds WebSocket lifecycle (`onConnect`, `onMessage`, `onClose`), streaming, and assistant-ui compatibility. For agents humans chat with directly.
- **`Agent<Env>`** — pure backend/RPC. No WebSocket overhead. For long-running operations.

**Frontend Chat Agents** → extend `BaseChatAgent` (← `AIChatAgent<Env>`):
| Agent | Frontend Purpose |
|-------|----------------|
| `OrchestratorAgent` | Project steering, task assignment, status queries |
| `ResearchAgent` | Research Q&A, trend analysis, reports |
| `CloudflareAgent` | Deployed worker investigation, Cloudflare docs MCP |

**Backend Agents** → extend `BaseAgent` (← `Agent<Env>`):
| Agent | Backend Purpose |
|-------|----------------|
| `EngineerAgent` | Jules session orchestration, sprint execution |
| `GithubAgent` | Webhook consolidation, PR review |
| `GuardrailAgent` | Golden-path enforcement, code validation |
| `LearningAgent` | CI healing, HITL approval queue |
| `WorkshopAgent` | Workshop orchestration, spec generation |
| `DesignAgent` | Stitch UI design pipeline |
| `OverseerAgent` | Jules session monitoring |

**Collaboration Infrastructure** — `ChatRoom` → `CollaborationRoom`:
- Root `ChatRoom.ts` deleted (legacy duplicate, not in exports)
- `ChatRoom/index.ts` refactored into `CollaborationRoom/index.ts`
- `CollaborationService` (new, in `agent-support/`) manages collaboration rooms programmatically
- Frontend chat uses each agent's own AIChatAgent WebSocket — NOT a collaboration room

### 2.2 Base Class Structure

```typescript
// ai/providers/agent-support/base-agent.ts
abstract class BaseAgent extends Agent<Env> {
  abstract readonly agentName: string;
  protected readonly skills: string[] = [];  // Subclass declares skills here

  // Auto-initialized in onStart()
  public ai!: AIProvider;
  public logger!: Logger;
  public store!: AgentStateStore;
  public hitl!: HumanInTheLoopService;
  public memory?: EdigraphService;

  protected agentInit?(): Promise<void>;  // Subclass-specific init hook

  async onStart() {
    this.ai = new AIProvider(this.env);
    this.logger = new Logger(this.env, this.agentName);
    this.store = new AgentStateStore({ ctx: this.ctx, env: this.env, agentName: this.agentName, initialState: { status: 'idle', history: [] } });
    this.hitl = new HumanInTheLoopService(this.env);
    if (this.env.EDGRAPH) this.memory = new EdigraphService(this.env.EDGRAPH, this.ctx.id.toString());
    await this.agentInit?.();
  }

  protected async ensureReady() { if (!this.ai) await this.onStart(); }

  @callable() async ping() { return { status: 'pong', agent: this.agentName, ts: Date.now() }; }
  @callable() async healthProbe() { return this.buildFullHealth(); }

  protected async agentHealthChecks(): Promise<Record<string, unknown>> { return {}; }  // Override per-agent

  private async buildFullHealth() {
    const base = await AgentHealthService.baseChecks(this.agentName, this.env, this.ctx);
    const specific = await this.agentHealthChecks();
    return { ...base, ...specific };
  }
}
```

`BaseChatAgent` is identical but extends `AIChatAgent<Env>` and adds `verifyChatFormat()` to `buildFullHealth()`.

### 2.3 Skills — D1-Backed via SkillManager

**Remove:** `src/backend/src/services/octokit/skill-fetcher.ts`

**New:** `agent-support/skills.ts` — `SkillManager` reads from `agent_skills` D1 table:
```typescript
class SkillManager {
  async getSkillInstructions(skillNames: string[]): Promise<string> {
    if (!skillNames.length) return '';
    const rows = await getDb(this.db).select({ content: agentSkills.markdownContent })
      .from(agentSkills).where(inArray(agentSkills.name, skillNames));
    return rows.map(r => r.content).join('\n\n---\n\n');
  }
}
```

**`AIOptions` addition:**
```typescript
skills?: string[];  // D1 agent_skills names to inject as <skill_context>
```

**All generation methods** intercept `options.skills` and prepend `<skill_context>` to systemPrompt.

**Backend agents** declare skills as a class constant — passed to every AI call via `options.skills`:
```typescript
protected readonly skills = ['deep-research', 'plan-writing'];
// In method: { skills: this.skills }
```

**Frontend chat agents** accept `selectedSkills` from incoming message metadata (set by assistant-ui or user selection) OR fall back to `this.skills`.

### 2.4 AgentStateStore — Always Mirror to D1

All agent state goes through `AgentStateStore`. Every `set()` and `patch()` fires a D1 mirror (fire-and-forget via `ctx.waitUntil`) to `agentStateMirror` table. This enables:
1. Verbose frontend state visibility
2. Collaboration recovery if DO is evicted
3. Simplified agent-to-agent state queries via D1

No state type generics on base class. Each agent defines its own state interface extending `PersistentAgentState`.

### 2.5 Jules `generateStructuredResponse` — Two-Step Pattern

Jules cannot produce native JSON-mode output. Two-step pattern (formalized in `vendors/jules.ts`, transparent to callers):

```
Step 1: Jules.generateText(prompt + schema instructions) → julesText
Step 2: workers-ai.generateStructuredResponse("Parse this into schema:\n" + julesText, schema) → T
Return T  // caller sees no difference
```

Callers invoke `ai.generateStructuredResponse(prompt, schema, systemPrompt, { provider: 'jules' })` identically to any other provider. The Jules-specific two-step is encapsulated within the vendor.

### 2.6 Agent Collaboration Service

New `CollaborationService` in `agent-support/collaboration.ts`, available via `this.ai.collaboration` or base class property. Creates silo'd `CollaborationRoom` Durable Objects per session — agents cannot cross-contaminate sessions.

```typescript
// Open a silo'd session
const sessionId = await this.collab.openCollaboration({
  sessionId: crypto.randomUUID(),
  initiator: this.agentName,
  participants: [
    { agentName: 'GuardrailAgent', assignment: 'Audit Jules output for standards', triggerCondition: 'jules_task_complete' },
    { agentName: 'CloudflareAgent', assignment: 'Scan wrangler.jsonc for empty bindings', triggerCondition: 'immediately' },
  ],
  repoOwner, repoName,
});

// Post messages (fully traced to D1 + Logger)
await this.collab.sendCollabMessage(sessionId, this.agentName, 'Jules task dispatched', { julesSessionId });

// Wake a collaborator
await this.collab.triggerCollaborator(sessionId, 'GuardrailAgent', prompt);
```

D1 tables: `collaborations`, `collaboration_participants`, `collaboration_events`.  
Frontend: Real-time WebSocket subscription via CollaborationRoom. Global + workspace viewports.

### 2.7 Human-in-the-Loop (HITL) Service

New `HumanInTheLoopService` in `agent-support/hitl.ts`, available via `this.hitl` on all agents.

**Webhook handler change:** Instead of auto-triggering agent actions, all GitHub webhook events now create a HITL proposal:
```typescript
// BEFORE: await autoTrigger(payload)
// AFTER:
const hitlId = await this.hitl.propose({
  type: `webhook-${event}`,
  proposedAction: buildProposalDescription(payload),
  payload, repoOwner, repoName,
});
// Returns 200 — no action taken until user approves
```

**HITL lifecycle:**
1. `propose()` → creates `hitl_proposals` D1 row (status: pending)
2. User reviews in frontend queue → selects Approve / Reject / Iterate
3. `approve()` → executes deferred action, creates `hitl_decisions` row
4. `iterate(feedback)` → creates `hitl_revisions` row with version++, re-presents to user
5. `reject()` → creates `hitl_decisions` row (status: rejected), no action

D1 tables: `hitl_proposals`, `hitl_revisions`, `hitl_decisions`.  
Frontend: Global queue + per-repo queue. Accordion sidebar nav. Per-item detail view with approve/reject/iterate controls.

### 2.8 Health — Three-Layer Architecture

**Layer 1 — Common base** (`agent-support/health-base.ts`):
- Env binding reachability (DB, AI, EDGRAPH)
- D1 round-trip latency
- AIProvider init test
- Logger write test
- `ensureReady()` guard verification

**Layer 2 — Per-agent** (`agentHealthChecks()` override per agent):
- OrchestratorAgent: all agent bindings reachable via RPC
- CloudflareAgent: Cloudflare API key, CF docs MCP tool
- GuardrailAgent: D1 guardrail rules table, rule cache warm
- EngineerAgent: Jules session creation test, D1 migration status
- GithubAgent: GitHub API key, webhook D1 table

**Layer 3 — Chat format verification** (`BaseChatAgent` only):
```typescript
protected async verifyChatFormat(): Promise<{ ok: boolean; error?: string }>
// Sends synthetic message through agent's onMessage handler
// Verifies response parts format: [{ type: 'text', text: '...' }]
// Tests WebSocket upgrade path — catches "spinning wheel" issues programmatically
```

All three layers integrate into `health/coordinator.ts` as named checks.

### 2.9 Prompt/Config Centralization

All AI invocations must use `getAgentFunctionConfig(agentName, functionName)` to resolve systemPrompt, provider, and model. **Coding agent must audit all agent methods before migration** to:
1. Find hardcoded system prompt strings
2. Find hardcoded provider/model strings
3. Find `generateText` calls where prompt instructs JSON output → convert to `generateStructuredResponse`
4. Add missing entries to `db/services/agent-config/seed.ts`

Standard pattern for all agent AI calls:
```typescript
const config = await this.ai.getAgentFunctionConfig(this.agentName, 'methodName');
const result = await this.ai.generateStructuredResponse(
  userPrompt, ResponseSchema, config.systemInstructions,
  { provider: config.primaryProvider, model: config.primaryModel, skills: this.skills }
);
```

---

## 3. File Map

### New Files
| File | Purpose |
|------|---------|
| `ai/providers/agent-support/skills.ts` | SkillManager — D1-backed skill injection |
| `ai/providers/agent-support/base-agent.ts` | BaseAgent abstract class |
| `ai/providers/agent-support/base-chat-agent.ts` | BaseChatAgent abstract class |
| `ai/providers/agent-support/collaboration.ts` | CollaborationService |
| `ai/providers/agent-support/hitl.ts` | HumanInTheLoopService |
| `ai/providers/agent-support/health-base.ts` | AgentHealthService common checks |
| `ai/agents/CollaborationRoom/index.ts` | Refactored from ChatRoom/ |
| `ai/agents/CollaborationRoom/methods/messaging.ts` | Collaboration messaging |
| `db/schemas/agents/collaborations.ts` | D1 schema for collaboration tables |
| `db/schemas/agents/hitl.ts` | D1 schema for HITL tables |
| `db/migrations/XXXX_add_collaborations.sql` | Migration |
| `db/migrations/XXXX_add_hitl.sql` | Migration |

### Modified Files
| File | Change |
|------|--------|
| `ai/providers/types.ts` | Add `skills?: string[]` to AIOptions |
| `ai/providers/methods/generation.ts` | Skills injection in all generation methods |
| `ai/providers/agent-support/state-store.ts` | Add D1 mirror on every state write |
| `ai/providers/agent-support/index.ts` | Export new classes |
| `ai/providers/index.ts` | Re-export new classes |
| `ai/providers/clients/vercel/chat/tools.ts` | Extract selectedSkills from message context |
| `ai/providers/vendors/jules.ts` | Formalize two-step generateStructuredResponse |
| `ai/agents/OrchestratorAgent/index.ts` | → BaseChatAgent |
| `ai/agents/ResearchAgent/index.ts` | → BaseChatAgent |
| `ai/agents/CloudflareAgent/index.ts` | → BaseChatAgent |
| `ai/agents/EngineerAgent/index.ts` | → BaseAgent |
| `ai/agents/GithubAgent/index.ts` | → BaseAgent |
| `ai/agents/GuardrailAgent/index.ts` | → BaseAgent |
| `ai/agents/LearningAgent/index.ts` | → BaseAgent |
| `ai/agents/WorkshopAgent/index.ts` | → BaseAgent |
| `ai/agents/DesignAgent/index.ts` | → BaseAgent |
| `ai/agents/OverseerAgent/index.ts` | → BaseAgent |
| `ai/agents/exports.ts` | Update ChatRoom → CollaborationRoom |
| `routes/api/webhooks/index.ts` | HITL proposal instead of auto-trigger |
| `health/coordinator.ts` | Add per-agent health checks |
| `db/services/agent-config/seed.ts` | Add missing agent/function configs |

### Deleted Files
| File | Reason |
|------|--------|
| `ai/agents/ChatRoom.ts` | Legacy root duplicate — not in exports.ts |
| `services/octokit/skill-fetcher.ts` | Replaced by D1-backed SkillManager |

---

## 4. Reusable Existing Infrastructure

- `AIProvider` class → `ai/providers/index.ts` (all generation methods)
- `AgentStateStore` → `ai/providers/agent-support/state-store.ts`
- `EdigraphService` → `ai/providers/agent-support/edigraph-memory.ts`
- `agent_skills` D1 table → `db/schemas/agents/skills.ts`
- `getAgentFunctionConfig()` on AIProvider → D1-backed config lookup
- `Logger` → `lib/logger`
- `agentStateMirror`, `chatRoomLogs`, `chatRoomSubscribers` → `db/schemas/agents/mirror.ts`
- Health coordinator → `health/coordinator.ts` (30+ checks, AI diagnostics)
- Webhook handler → `routes/api/webhooks/index.ts` (idempotency via delivery_id)
- Skills API → `routes/api/skills.ts` (ingest, seed, sync)

---

## 5. Verification

```bash
# TypeScript — zero errors required
npx tsc --noEmit

# Dry-run deployment — validates DO bindings
pnpm run dry-run

# Agent health probes — all return consistent { agent, status, timestamp }
curl https://core-github-api.hacolby.workers.dev/health | jq '.checks'

# Skill injection — check Cloudflare logs for <skill_context> in prompt
# Trigger OrchestratorAgent.submitBrief, inspect Worker logs

# Frontend chat — verifyChatFormat must return { ok: true }
# Open assistant-ui → chat with OrchestratorAgent, ResearchAgent, CloudflareAgent
# Verify: streaming works, no spinning wheel, parts format correct

# Collaboration round-trip
# Call EngineerAgent.openCollaboration() RPC
# Assert: D1 collaborations row created, WebSocket broadcast received

# HITL round-trip
# POST /api/webhooks with PR event
# Assert: hitl_proposals D1 row (status: pending), NO auto-action taken
# POST /api/hitl/:id/approve
# Assert: hitl_decisions row (status: approved), deferred action executed
```
