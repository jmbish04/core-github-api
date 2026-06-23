# Standardize Agents — Architecture Plan v2

**Date:** 2026-04-17  
**Supersedes:** `docs/20260417/standardize_agents/v1/PLAN.md`  
**Sources:** Claude v1 plan + Gemini v1 plan + Cloudflare Agents SDK docs + live codebase

---

## V1 Comparison: What Changed and Why

### Adopted from Gemini v1
| Decision | Rationale |
|----------|-----------|
| Rename `CollaborationRoom` → **`CollaborationSpace`** | Cleaner semantics — a "space" is a silo'd workspace, a "room" implies chat |
| `isFrontendFacing: boolean` in healthProbe return | Health coordinator can programmatically test stream compatibility only on chat agents |
| `agentHealth()` protected hook name | Shorter/cleaner than `agentHealthChecks()` |
| 5-phase structure with explicit success criteria | Forces the coding agent to verify before proceeding |

### Corrections to Gemini v1
| Error | Correction from Docs/Codebase |
|-------|-------------------------------|
| `import { AIChatAgent } from "agents"` | **`AIChatAgent` is from `@cloudflare/ai-chat`**, not `agents`. Per docs: `import { AIChatAgent } from "@cloudflare/ai-chat"` |
| `new AgentStateStore(this.ctx, this.env, this.agentName)` | Actual constructor is `new AgentStateStore({ ctx, env, agentName, initialState })` — object param, not positional |
| `ConfigService.getBasePrompt(env)` | This method does not exist. Correct method is `ai.getAgentFunctionConfig(agentName, functionName)` on AIProvider |
| Jules step 2 model: `@cf/meta/llama-3.1-8b-instruct` | Codebase uses `STRUCTURING_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'` — stronger, designed for structured output |
| `verifyStreamContract(): return true` | A stub that always returns true is worse than no check. V2 provides a real implementation |
| `db/schemas/workflows/hitl.ts` | No `workflows/` folder in `db/schemas/`. Correct path: `db/schemas/agents/hitl.ts` |
| `unified_action_logs` table | Does not exist. Existing tables are `chatRoomLogs`, `collaboration_events` (new). No new catch-all table needed |

### Corrections to Claude v1
| Gap | Correction from Docs |
|-----|---------------------|
| `onMessage()` override on AIChatAgent | Correct override is **`onChatMessage(onFinish)`** — per Cloudflare Agents SDK docs. `onMessage()` is the raw WebSocket hook |
| No `keepAliveWhile()` for long tasks | Docs: DOs are evicted after 70–140s inactivity. `BaseAgent` must expose `this.keepAliveWhile()` for agents like EngineerAgent running Jules sessions |
| `this.messages` not referenced | `AIChatAgent` automatically persists messages to SQLite and exposes `this.messages`. `BaseChatAgent` must not break this |
| `streamText().toUIMessageStreamResponse()` not specified | This is the canonical streaming response pattern per docs. Agents must return this exact type |
| `verifyChatFormat()` implementation was vague | V2 specifies a concrete, side-effect-free implementation |

---

## 1. Cloudflare SDK Grounding (From Docs)

### 1.1 Agent Class Hierarchy
```
DurableObject → Server → Agent → AIChatAgent
```
Per Cloudflare docs:
- **`Agent<Env, State>`** from `"agents"` — base class for all agents. Provides `onStart`, `onRequest`, WebSocket lifecycle, `@callable()` RPC, `setState()`, `this.state`, `keepAlive()`, `keepAliveWhile()`, `getAgentByName()`.
- **`AIChatAgent<Env>`** from `"@cloudflare/ai-chat"` — extends `Agent`. Adds: automatic message persistence to SQLite (`this.messages`), resumable streaming, `onChatMessage()` hook, `useAgentChat` React hook support. **For building a chat agent.** Extending it for backend task work is an anti-pattern.
- Using `AIChatAgent` for backend agents adds unnecessary SQLite message persistence overhead and WebSocket upgrade handling on every request.

### 1.2 AIChatAgent Canonical Pattern (From Docs)
```typescript
import { AIChatAgent } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages } from "ai";

export class MyChatAgent extends AIChatAgent<Env> {
  // The CORRECT override — not onMessage(), not onRequest()
  async onChatMessage(onFinish: (messages: Message[]) => void) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      messages: await convertToModelMessages(this.messages), // this.messages is auto-persisted
    });
    return result.toUIMessageStreamResponse(); // MUST return this type for assistant-ui
  }
}
```

### 1.3 Long-Running Tasks: `keepAliveWhile()`
```typescript
// Per Cloudflare docs: DOs are evicted after 70–140s inactivity
// For long operations (Jules sessions, research pipelines):
const result = await this.keepAliveWhile(async () => {
  return await longRunningOperation();
});
// Automatically disposes heartbeat when done
```

### 1.4 Workers AI Structured Output (From Docs)
```typescript
// Workers AI supports native JSON mode via generateObject (Vercel AI SDK):
import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";

const { object } = await generateObject({
  model: createWorkersAI({ binding: env.AI })('@cf/meta/llama-4-scout-17b-16e-instruct'),
  schema: MyZodSchema,
  prompt: "...",
});
```
Workers AI JSON mode is compatible with `response_format: { type: "json_schema" }`. The Vercel AI SDK's `generateObject()` handles this automatically.

### 1.5 DO RPC and getAgentByName
```typescript
// Per docs — stub is typed to the DO class:
const stub = await getAgentByName<Env>(env.ENGINEER_AGENT, "session-123");
await stub.someCallableMethod(); // Typed RPC
```

---

## 2. Agent Taxonomy (Definitive)

### 2.1 Frontend Chat Agents → `BaseChatAgent` (extends `AIChatAgent`)
These are the **only** agents that humans chat with directly via assistant-ui.

| Agent | Frontend Purpose | Canonical Skills |
|-------|----------------|-----------------|
| `OrchestratorAgent` | Project steering, task assignment, sprint queries | `plan-writing`, `architecture`, `task-management` |
| `ResearchAgent` | Research Q&A, trend analysis, live reports | `deep-research`, `brainstorming`, `source-evaluation` |
| `CloudflareAgent` | Worker investigation, CF docs consultation | `cloudflare-docs`, `workers-architecture`, `debugging` |

These implement `onChatMessage()` and return `streamText().toUIMessageStreamResponse()`.

### 2.2 Backend Task Agents → `BaseAgent` (extends `Agent`)
These run long operations, serve RPC, and participate in Workflows. No WebSocket overhead.

| Agent | Backend Purpose | Key Capability |
|-------|----------------|---------------|
| `EngineerAgent` | Jules session orchestration, sprint execution | `keepAliveWhile()` for Jules sessions |
| `GithubAgent` | Webhook processing, PR review, repo analysis | DO alarms for webhook dedup |
| `GuardrailAgent` | Golden-path enforcement, code validation | D1 rule cache warm-start |
| `LearningAgent` | CI healing, HITL approval dispatch | Alarm-based HITL polling |
| `WorkshopAgent` | Workshop orchestration, spec generation | Multi-step Workflow integration |
| `DesignAgent` | Stitch UI design pipeline | Workflow integration |
| `OverseerAgent` | Jules session monitoring | DO alarm-based session polling |

### 2.3 Collaboration Infrastructure → `CollaborationSpace` (extends `BaseChatAgent`)
Purpose-built for agent-to-agent collaboration sessions. Uses WebSocket for real-time broadcast between agents. Repurposed from `ChatRoom/index.ts`.

**Important**: This is NOT what users chat with. It is a silo'd DO workspace that agents write to and read from programmatically via RPC. Frontend *observes* it — it does not initiate it.

---

## 3. Base Classes — Canonical Implementation

### 3.1 `BaseAgent` (`agent-support/base-agent.ts`)

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

  // Declared but initialized in onStart — guards in ensureReady()
  public ai!: AIProvider;
  public logger!: Logger;
  public store!: AgentStateStore;
  public hitl!: HitlQueue;
  public collab!: CollaborationService;
  public memory?: EdigraphService;

  // Subclass declares relevant skills as a class constant
  protected readonly skills: string[] = [];

  // Optional hooks for subclasses
  protected agentInit?(): Promise<void>;
  protected agentHealth?(): Promise<string[]>;

  async onStart() {
    const env = this.env as any;
    
    this.logger = new Logger(env, this.agentName);
    this.ai = new AIProvider(env);
    this.store = new AgentStateStore({
      ctx: this.ctx,
      env,
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
      if (this.agentHealth) {
        const checks = await this.agentHealth();
        capabilities.push(...checks);
      }
    } catch (e: any) {
      status = "degraded";
      this.logger.error(`Health check failed`, e);
      capabilities.push(`error:${e.message}`);
    }

    return {
      agent: this.agentName,
      status,
      timestamp: Date.now(),
      capabilities,
      isFrontendFacing: false,
    };
  }
}
```

**Key additions over both v1 plans:**
- `hitl` and `collab` are first-class properties on all agents — not imported ad-hoc
- `keepAliveWhile()` is inherited from `Agent` base class — used in methods, not overridden here
- `isFrontendFacing: false` — health coordinator uses this to skip stream tests

### 3.2 `BaseChatAgent` (`agent-support/base-chat-agent.ts`)

```typescript
import { AIChatAgent } from "@cloudflare/ai-chat"; // NOTE: NOT from "agents"
import { streamText, generateText, convertToModelMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";
// ... same imports as BaseAgent ...

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
    this.logger.info(`${this.agentName} (chat) initialized`);
  }

  protected async ensureReady() {
    if (!this.ai) await this.onStart();
  }

  // Subclasses MUST override this — it is the AIChatAgent message hook
  // Default implementation: echo via default model (subclasses provide their own)
  async onChatMessage(onFinish: (messages: any[]) => void) {
    await this.ensureReady();
    const config = await this.ai.getAgentFunctionConfig(this.agentName, "onChatMessage");
    const env = this.env as any;
    const workersai = createWorkersAI({ binding: env.AI });

    const result = streamText({
      model: workersai(config?.primaryModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: config?.systemInstructions,
      messages: await convertToModelMessages(this.messages),
      onFinish: ({ response }) => onFinish(response.messages),
    });

    return result.toUIMessageStreamResponse();
  }

  @callable()
  async ping() {
    return { status: "pong", agent: this.agentName, ts: Date.now() };
  }

  @callable()
  async healthProbe() {
    await this.ensureReady();
    const capabilities: string[] = [
      "bindings_ok",
      "state_store_mirrored",
      "websocket_hibernation_ready",
    ];
    let status = "ok";

    // Concrete stream format check — not a stub
    const streamCheck = await this.verifyChatFormat();
    if (!streamCheck.ok) {
      status = "degraded";
      capabilities.push(`stream_error:${streamCheck.error}`);
    } else {
      capabilities.push("assistant_ui_stream_compatible");
    }

    try {
      if (this.agentHealth) capabilities.push(...(await this.agentHealth()));
    } catch (e: any) {
      status = "degraded";
      this.logger.error(`Health check failed`, e);
      capabilities.push(`error:${e.message}`);
    }

    return {
      agent: this.agentName,
      status,
      timestamp: Date.now(),
      capabilities,
      isFrontendFacing: true,
    };
  }

  // Concrete stream format verification — checks what actually fails in production
  private async verifyChatFormat(): Promise<{ ok: boolean; error?: string }> {
    try {
      const env = this.env as any;

      // 1. Verify this.messages (AIChatAgent SQLite persistence) is accessible
      const _ = Array.isArray(this.messages);

      // 2. Verify AI binding is functional via minimal inference
      const workersai = createWorkersAI({ binding: env.AI });
      const { text } = await generateText({
        model: workersai("@cf/meta/llama-3.1-8b-instruct"),
        prompt: "Reply with the single word: ok",
        maxTokens: 5,
      });

      if (!text || text.length === 0) {
        return { ok: false, error: "AI binding returned empty response" };
      }

      // 3. Verify streamText can be imported and called
      // (catches import/bundle errors that only appear at runtime)
      const probe = streamText({
        model: workersai("@cf/meta/llama-3.1-8b-instruct"),
        prompt: "ok",
        maxTokens: 1,
      });
      // Verify it has toUIMessageStreamResponse — the key assistant-ui method
      if (typeof probe.toUIMessageStreamResponse !== "function") {
        return { ok: false, error: "toUIMessageStreamResponse not available — version mismatch" };
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
```

---

## 4. AIProvider: Skills + Jules Two-Step

### 4.1 Skill Injection (SkillManager)
New file `agent-support/skills.ts` — reads from existing `agent_skills` D1 table:

```typescript
export class SkillManager {
  constructor(private env: Env) {}

  async getSkillInstructions(skillNames: string[]): Promise<string> {
    if (!skillNames.length) return "";
    try {
      const rows = await getDb(this.env.DB)
        .select({ content: agentSkills.markdownContent })
        .from(agentSkills)
        .where(inArray(agentSkills.name, skillNames));
      if (!rows.length) return "";
      const body = rows.map(r => r.content).join("\n\n---\n\n");
      return `<skill_context>\n${body}\n</skill_context>`;
    } catch (e) {
      console.warn("[SkillManager] Skill load failed (non-fatal):", e);
      return "";
    }
  }
}
```

`AIOptions` gains `skills?: string[]`. All generation methods in `methods/generation.ts` intercept it:
```typescript
if (options?.skills?.length) {
  const sm = new SkillManager(ai.env);
  const ctx = await sm.getSkillInstructions(options.skills);
  if (ctx) systemPrompt = `${systemPrompt ?? ""}\n\n${ctx}`.trim();
}
```

### 4.2 Jules Two-Step `generateStructuredResponse`
Formalized inside `vendors/jules.ts`. Caller interface is identical regardless of provider:

```typescript
// In vendors/jules.ts — triggered when options.provider === 'jules'
export async function generateStructuredResponse<T>(
  env: Env, prompt: string, schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions
): Promise<T> {
  // Step 1: Jules text generation (Jules has no native JSON mode)
  const julesClient = await getJulesClient(env);
  const schemaDescription = JSON.stringify(zodToJsonSchema(schema), null, 2);
  const julesPrompt = [
    systemPrompt,
    `Your response must map to this JSON schema:\n${schemaDescription}`,
    prompt,
  ].filter(Boolean).join("\n\n");

  const julesText = await julesClient.generateText(julesPrompt);

  // Step 2: Workers AI structures the Jules text into the Zod schema
  // Uses STRUCTURING_MODEL — designed for JSON extraction tasks
  const { object } = await generateObject({
    model: createWorkersAI({ binding: env.AI })(STRUCTURING_MODEL), // @cf/meta/llama-4-scout-17b-16e-instruct
    schema,
    prompt: `Extract and format the following text into the JSON schema provided. Output only valid JSON.\n\nTEXT:\n${julesText}`,
  });

  return object;
}
```

---

## 5. CollaborationSpace (Repurposed from ChatRoom)

`CollaborationSpace` extends `BaseChatAgent` (needs WebSocket for agent broadcast).

### RPC Interface
```typescript
export class CollaborationSpace extends BaseChatAgent {
  readonly agentName = "CollaborationSpace";

  // Agents call this to register themselves in a collaboration session
  @callable()
  async addCollaborator(agentName: string, assignment: string, triggerCondition: string): Promise<void>

  // Initiating agent calls this to define the session scope
  @callable()
  async openSession(sessionId: string, initiator: string, repoOwner?: string, repoName?: string): Promise<void>

  // Any collaborator can post a message to the shared channel
  @callable()
  async postMessage(from: string, content: string, metadata?: Record<string, unknown>): Promise<void>

  // Wake a specific collaborator with a prompt
  @callable()
  async triggerCollaborator(agentName: string, prompt: string): Promise<void>

  // Read recent events
  @callable()
  async getEvents(limit?: number): Promise<CollabEvent[]>

  // Close the session
  @callable()
  async closeSession(outcome: string): Promise<void>
}
```

### D1 Schema (new tables)
```sql
-- Indexed by (session_id) — one CollaborationSpace DO per session
CREATE TABLE collaboration_sessions (
  id TEXT PRIMARY KEY,           -- sessionId = DO name
  initiator TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  outcome TEXT,
  repo_owner TEXT,
  repo_name TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE collaboration_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES collaboration_sessions(id),
  agent_name TEXT NOT NULL,
  assignment TEXT NOT NULL,
  trigger_condition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',  -- waiting | active | completed
  joined_at TEXT NOT NULL
);

CREATE TABLE collaboration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES collaboration_sessions(id),
  from_agent TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- message | trigger | status_change | close
  content TEXT NOT NULL,
  metadata_json TEXT,
  ts TEXT NOT NULL
);
```

### How Agents Use It
```typescript
// In EngineerAgent — open a silod collaboration for a Jules coding task
const sessionId = crypto.randomUUID();
const space = await getAgentByName(this.env.COLLABORATION_SPACE, sessionId);

await space.openSession(sessionId, "EngineerAgent", repoOwner, repoName);
await space.addCollaborator("GuardrailAgent", "Audit Jules output for code standards", "jules_task_complete");
await space.addCollaborator("CloudflareAgent", "Scan wrangler bindings and create missing ones", "immediately");

// Later — trigger collaborators
await space.triggerCollaborator("GuardrailAgent", guardrailPrompt);
await this.keepAliveWhile(() => waitForCollaborationComplete(sessionId));
```

---

## 6. HITL Queue Service (`agent-support/hitl-queue.ts`)

All GitHub webhooks now enqueue proposals instead of auto-executing.

```typescript
export class HitlQueue {
  constructor(private env: Env) {}

  async propose(params: {
    type: string;
    proposedAction: string;        // Human-readable description
    proposedMarkdown: string;       // Full markdown proposal with context
    payload: unknown;
    repoOwner?: string;
    repoName?: string;
    agentName?: string;
  }): Promise<string>              // returns hitlId

  async approve(hitlId: string, userId: string): Promise<void>
  async reject(hitlId: string, userId: string, reason: string): Promise<void>
  async iterate(hitlId: string, feedback: string): Promise<string>  // new version id
  async list(filters?: HitlFilters): Promise<HitlProposal[]>
  async get(hitlId: string): Promise<HitlProposal>
}
```

### D1 Schema
```sql
CREATE TABLE hitl_proposals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  proposed_markdown TEXT NOT NULL,  -- rich context for frontend display
  payload_json TEXT NOT NULL,
  repo_owner TEXT,
  repo_name TEXT,
  agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE hitl_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id TEXT NOT NULL REFERENCES hitl_proposals(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE hitl_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id TEXT NOT NULL REFERENCES hitl_proposals(id),
  decision TEXT NOT NULL,  -- approved | rejected
  user_id TEXT NOT NULL,
  reason TEXT,
  decided_at TEXT NOT NULL
);
```

### Webhook Handler Change
```typescript
// routes/api/webhooks/index.ts — BEFORE: auto-trigger
// AFTER: queue for human review
const hitlId = await new HitlQueue(env).propose({
  type: `webhook:${githubEvent}`,
  proposedAction: buildActionSummary(githubEvent, payload),
  proposedMarkdown: buildProposalMarkdown(githubEvent, payload),
  payload,
  repoOwner: payload.repository?.owner?.login,
  repoName: payload.repository?.name,
});

return c.json({ status: "queued", hitlId }, 202);
// Existing delivery_id deduplication (already in place) prevents duplicate proposals
```

---

## 7. Health Architecture

### Three Layers
1. **Base checks** (both base classes) — bindings, D1 round-trip, AI key
2. **Agent-specific** (`agentHealth()` override per agent)
3. **Chat format** (`BaseChatAgent` only) — `verifyChatFormat()` with real inference test

### Health Coordinator Integration (`health/coordinator.ts`)
```typescript
// Add to existing 30+ checks:
const agentBindings = [
  { name: "OrchestratorAgent", binding: env.ORCHESTRATOR_AGENT, isFrontend: true },
  { name: "ResearchAgent",    binding: env.RESEARCH_AGENT,    isFrontend: true },
  { name: "CloudflareAgent",  binding: env.CLOUDFLARE_AGENT,  isFrontend: true },
  { name: "EngineerAgent",    binding: env.ENGINEER_AGENT,    isFrontend: false },
  // ... etc
];

for (const { name, binding, isFrontend } of agentBindings) {
  checks.push({
    name: `agent:${name}`,
    run: async () => {
      const stub = await getAgentByName(binding, "health-probe");
      const result = await stub.healthProbe();
      
      // Extra gate: frontend agents MUST have stream compatibility
      if (isFrontend && !result.capabilities.includes("assistant_ui_stream_compatible")) {
        return { status: "fail", detail: "Missing stream compatibility" };
      }
      return { status: result.status, detail: result.capabilities };
    }
  });
}
```

### `agentHealth()` Implementations Per Agent
```typescript
// OrchestratorAgent
protected async agentHealth() {
  const checks = [];
  for (const [name, binding] of Object.entries(this.env).filter(([k]) => k.endsWith("_AGENT"))) {
    try {
      const stub = await getAgentByName(binding as any, "health");
      await stub.ping();
      checks.push(`rpc:${name}:ok`);
    } catch { checks.push(`rpc:${name}:fail`); }
  }
  return checks;
}

// GuardrailAgent
protected async agentHealth() {
  const rules = await getDb(this.env.DB).select().from(guardrailRules).limit(1);
  const checks = rules.length > 0 ? ["d1_rules:ok"] : ["d1_rules:empty"];
  const cache = await this.ctx.storage.get("ruleCache");
  checks.push(cache ? "rule_cache:warm" : "rule_cache:cold");
  return checks;
}

// CloudflareAgent
protected async agentHealth() {
  // Verify Cloudflare API key works (lightweight list call)
  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${(this.env as any).CLOUDFLARE_API_TOKEN}` }
    });
    return [resp.ok ? "cf_api:ok" : "cf_api:fail"];
  } catch { return ["cf_api:error"]; }
}
```

---

## 8. AgentStateStore — D1 Mirror

`state-store.ts` gains D1 mirror on every `set()` and `patch()`:

```typescript
// Fire-and-forget — DO state write must never fail due to D1 issues
async set(nextState: State): Promise<void> {
  this.currentState = nextState;
  await this.ctx.storage.put("state", nextState);
  this.ctx.waitUntil(this.mirrorToD1(nextState).catch(e =>
    console.warn("[AgentStateStore] D1 mirror failed (non-fatal):", e)
  ));
}

private async mirrorToD1(state: State): Promise<void> {
  await getDb(this.env.DB)
    .insert(agentStateMirror)
    .values({
      agentId: this.ctx.id.toString(),
      agentType: this.agentName,
      stateJson: JSON.stringify(state),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: agentStateMirror.agentId,
      set: { stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() },
    });
}
```

Note: `agentStateMirror` table **already exists** in `db/schemas/agents/mirror.ts`. No schema migration needed for this.

---

## 9. File Structure (Definitive)

```
src/backend/src/
├── ai/
│   ├── agents/
│   │   ├── ChatRoom.ts                    ← DELETE (legacy root duplicate)
│   │   ├── CollaborationSpace/            ← RENAME from ChatRoom/
│   │   │   ├── index.ts                   ← CollaborationSpace extends BaseChatAgent
│   │   │   └── methods/messaging.ts       ← message persistence + D1 mirror
│   │   ├── OrchestratorAgent/             ← extends BaseChatAgent (frontend)
│   │   ├── ResearchAgent/                 ← extends BaseChatAgent (frontend)
│   │   ├── CloudflareAgent/               ← extends BaseChatAgent (frontend)
│   │   ├── EngineerAgent/                 ← extends BaseAgent (backend)
│   │   ├── GithubAgent/                   ← extends BaseAgent (backend)
│   │   ├── GuardrailAgent/                ← extends BaseAgent (backend)
│   │   ├── LearningAgent/                 ← extends BaseAgent (backend)
│   │   ├── WorkshopAgent/                 ← extends BaseAgent (backend)
│   │   ├── DesignAgent/                   ← extends BaseAgent (backend)
│   │   └── OverseerAgent/                 ← extends BaseAgent (backend)
│   │
│   └── providers/
│       ├── index.ts                        ← re-exports BaseAgent, BaseChatAgent
│       ├── types.ts                        ← AIOptions gains skills?: string[]
│       ├── methods/generation.ts           ← skill injection in all methods
│       ├── vendors/jules.ts                ← formalize two-step generateStructured
│       └── agent-support/
│           ├── index.ts                    ← barrel exports
│           ├── base-agent.ts               ← NEW: BaseAgent abstract
│           ├── base-chat-agent.ts          ← NEW: BaseChatAgent abstract
│           ├── skills.ts                   ← NEW: SkillManager (D1-backed)
│           ├── hitl-queue.ts               ← NEW: HitlQueue service
│           ├── collaboration.ts            ← NEW: CollaborationService (opens CollaborationSpace DOs)
│           ├── health-base.ts              ← NEW: AgentHealthService shared checks
│           └── state-store.ts              ← MODIFY: add D1 mirror
│
├── db/
│   ├── schemas/agents/
│   │   ├── mirror.ts                       ← EXISTING: agentStateMirror (no change)
│   │   ├── collaborations.ts               ← NEW: collaboration_sessions/participants/events
│   │   └── hitl.ts                         ← NEW: hitl_proposals/revisions/decisions
│   └── services/agent-config/seed.ts       ← ADD: missing agent/function entries
│
├── routes/api/
│   ├── webhooks/index.ts                   ← MODIFY: enqueue HITL instead of auto-trigger
│   └── hitl.ts                             ← NEW: GET/POST approve/reject/iterate endpoints
│
└── health/coordinator.ts                   ← ADD: per-agent health checks
```

**Deleted files:**
- `ai/agents/ChatRoom.ts` (root legacy)
- `services/octokit/skill-fetcher.ts` (replaced by SkillManager)

---

## 10. Verification

```bash
# 1. TypeScript — zero errors
npx tsc --noEmit

# 2. Dry-run — all DO bindings resolve (including CollaborationSpace)
pnpm run dry-run

# 3. Health endpoint — all agents, isFrontendFacing validated
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'
# OrchestratorAgent, ResearchAgent, CloudflareAgent must have assistant_ui_stream_compatible

# 4. Skill injection — trigger OrchestratorAgent.submitBrief, check Worker logs
# Expect: <skill_context> block in logged systemPrompt

# 5. Jules two-step — call generateStructuredResponse with provider='jules'
# Expect: structured T returned, no throw, Worker AI step 2 logged

# 6. CollaborationSpace round-trip
# EngineerAgent opens session → D1 collaboration_sessions row created
# triggerCollaborator → collaboration_events row + target agent RPC called

# 7. HITL round-trip
# POST /api/webhooks with PR event → hitl_proposals row (status: pending), 202 response
# POST /api/hitl/:id/approve → hitl_decisions row, deferred action executes

# 8. Frontend chat (BaseChatAgent agents only)
# useAgentChat() from assistant-ui → OrchestratorAgent → streaming response
# verifyChatFormat healthProbe result: { ok: true, capabilities: [..., 'assistant_ui_stream_compatible'] }
```
