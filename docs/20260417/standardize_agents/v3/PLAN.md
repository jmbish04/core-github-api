# Standardize Agents — Architecture Plan v3

**Date:** 2026-04-17  
**Supersedes:** `docs/20260417/standardize_agents/v2/PLAN.md`  
**Sources:** Claude v1 + Gemini v1 + Cloudflare Agents SDK docs + live codebase + Gemini corrections

---

## V2 → V3: Four Critical Corrections

| # | V2 Error | V3 Correction |
|---|----------|---------------|
| 1 | `import { AIChatAgent } from "@cloudflare/ai-chat"` in `base-chat-agent.ts` | **`import { AIChatAgent } from "agents"`** — `@cloudflare/ai-chat` is frontend-only (React `useAgentChat` hook). Backend `AIChatAgent` class is from `"agents"` per project rule in `06_ASSISTANT_UI_AGENT_CHAT.md` |
| 2 | `verifyChatFormat()` made live LLM inference calls (`generateText`, `streamText`) | **Static checks only**: verify `env.AI` binding exists, verify `Array.isArray(this.messages)`, verify `toUIMessageStreamResponse` is a function. No inference calls in health probes. |
| 3 | HITL schema path: `db/schemas/agents/hitl.ts` | **`db/schemas/workflows/hitl.ts`** — confirmed via glob. File already exists. Schema does NOT need to be created, only referenced. |
| 4 | Jules step 2 hardcoded system prompt | **Use `getAgentFunctionConfig(agentName, functionName)`** to pull step-2 system prompt from D1 `agent_function_configs` table. Never hardcode instructions in source. |

---

## 1. Cloudflare SDK Grounding

### 1.1 Agent Class Hierarchy
```
DurableObject → Server → Agent → AIChatAgent
```

- **`Agent<Env, State>`** from `"agents"` — base class for all agents. Provides `onStart`, `onRequest`, WebSocket lifecycle, `@callable()` RPC, `setState()`, `this.state`, `keepAlive()`, `keepAliveWhile()`, `getAgentByName()`.
- **`AIChatAgent<Env>`** from **`"agents"`** — extends `Agent`. Adds: automatic message persistence to SQLite (`this.messages`), resumable streaming, `onChatMessage()` hook, `useAgentChat` React hook support.
- **`@cloudflare/ai-chat`** — frontend-ONLY React package. Contains `useAgentChat`. Never import from this in backend agent code.

### 1.2 Canonical AIChatAgent Pattern
```typescript
import { AIChatAgent } from "agents"; // ← BACKEND class — from "agents" package
import { streamText, convertToModelMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export class MyChatAgent extends AIChatAgent<Env> {
  // Correct override — NOT onMessage(), NOT onRequest()
  async onChatMessage(onFinish: (messages: Message[]) => void) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      messages: await convertToModelMessages(this.messages),
    });
    return result.toUIMessageStreamResponse(); // MUST return this type for assistant-ui
  }
}
```

### 1.3 Long-Running Tasks: `keepAliveWhile()`
```typescript
// DOs evict after 70–140s inactivity — use for Jules sessions, research pipelines
const result = await this.keepAliveWhile(async () => {
  return await longRunningOperation();
});
```

### 1.4 Workers AI Structured Output
```typescript
import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";

const { object } = await generateObject({
  model: createWorkersAI({ binding: env.AI })('@cf/meta/llama-4-scout-17b-16e-instruct'),
  schema: MyZodSchema,
  prompt: "...",
});
```

---

## 2. Agent Taxonomy (Definitive)

### 2.1 Frontend Chat Agents → `BaseChatAgent`
| Agent | Frontend Purpose | Canonical Skills |
|-------|----------------|-----------------|
| `OrchestratorAgent` | Project steering, task assignment, sprint queries | `plan-writing`, `architecture`, `task-management` |
| `ResearchAgent` | Research Q&A, trend analysis, live reports | `deep-research`, `brainstorming`, `source-evaluation` |
| `CloudflareAgent` | Worker investigation, CF docs consultation | `cloudflare-docs`, `workers-architecture`, `debugging` |

These implement `onChatMessage()` and return `streamText().toUIMessageStreamResponse()`.

### 2.2 Backend Task Agents → `BaseAgent`
| Agent | Backend Purpose | Key Capability |
|-------|----------------|---------------|
| `EngineerAgent` | Jules session orchestration, sprint execution | `keepAliveWhile()` for Jules sessions |
| `GithubAgent` | Webhook processing, PR review, repo analysis | DO alarms for webhook dedup |
| `GuardrailAgent` | Golden-path enforcement, code validation | D1 rule cache warm-start |
| `LearningAgent` | CI healing, HITL approval dispatch | Alarm-based HITL polling |
| `WorkshopAgent` | Workshop orchestration, spec generation | Multi-step Workflow integration |
| `DesignAgent` | Stitch UI design pipeline | Workflow integration |
| `OverseerAgent` | Jules session monitoring | DO alarm-based session polling |

### 2.3 Collaboration Infrastructure → `CollaborationSpace`
Repurposed from `ChatRoom/index.ts`. Extends `BaseChatAgent` (needs WebSocket for agent broadcast). Agents write to / read from it via RPC. Frontend observes — it does not initiate.

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
      this.logger.error("Health check failed", e);
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

### 3.2 `BaseChatAgent` (`agent-support/base-chat-agent.ts`)

**V3 CORRECTION #1**: Import from `"agents"`, not `"@cloudflare/ai-chat"`.

```typescript
import { AIChatAgent } from "agents"; // ← CORRECT: backend class from "agents" package
import { streamText, convertToModelMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { callable } from "agents";
import { AIProvider } from "../index";
import { AgentStateStore } from "./state-store";
import { EdigraphService } from "./edigraph-memory";
import { Logger } from "../../lib/logger";
import { HitlQueue } from "./hitl-queue";
import { CollaborationService } from "./collaboration";

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
    this.logger.info(`${this.agentName} (chat) initialized`);
  }

  protected async ensureReady() {
    if (!this.ai) await this.onStart();
  }

  // Default implementation — subclasses override with their own model/system prompt
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

    // V3 CORRECTION #2: Static checks only — no live inference
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
      this.logger.error("Health check failed", e);
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

  // V3 CORRECTION #2: Static checks ONLY — no inference calls.
  // Live inference in health probes exhausts rate limits, causes cascading timeouts,
  // and runs up cost proportional to health check frequency.
  private async verifyChatFormat(): Promise<{ ok: boolean; error?: string }> {
    try {
      const env = this.env as any;

      // Check 1: AI binding present
      if (!env.AI) {
        return { ok: false, error: "env.AI binding missing" };
      }

      // Check 2: AIChatAgent message persistence initialized
      if (!Array.isArray(this.messages)) {
        return { ok: false, error: "this.messages not initialized (AIChatAgent SQLite not ready)" };
      }

      // Check 3: Verify streamText and toUIMessageStreamResponse are available
      // Creates a deferred stream with no model call — verifies SDK bundle integrity
      // without making any network requests.
      const workersai = createWorkersAI({ binding: env.AI });
      const probeResult = streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
        prompt: "__probe__",
        // abort immediately — we only need to verify the function returns the right shape
        abortSignal: AbortSignal.timeout(0),
      });

      if (typeof probeResult.toUIMessageStreamResponse !== "function") {
        return {
          ok: false,
          error: "toUIMessageStreamResponse not a function — ai-sdk version mismatch",
        };
      }

      return { ok: true };
    } catch (e: any) {
      // AbortError is expected (we abort immediately after shape check) — that's ok
      if (e?.name === "AbortError" || e?.message?.includes("aborted")) {
        return { ok: true };
      }
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

**V3 CORRECTION #4**: Step 2 system prompt comes from `getAgentFunctionConfig()`, never hardcoded.

```typescript
// In vendors/jules.ts — triggered when options.provider === 'jules'
export async function generateStructuredResponse<T>(
  env: Env,
  prompt: string,
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: AIOptions & { agentName?: string; functionName?: string }
): Promise<T> {
  // Step 1: Jules text generation (Jules has no native JSON mode)
  const julesClient = await getJulesClient(env);
  const schemaDescription = JSON.stringify(zodToJsonSchema(schema), null, 2);
  const julesPrompt = [
    systemPrompt,
    `Your response must map to this JSON schema:\n${schemaDescription}`,
    prompt,
  ].filter(Boolean).join("\n\n");

  let julesText: string;
  try {
    julesText = await julesClient.generateText(julesPrompt);
  } catch (e) {
    // Jules fallback: if Jules is unavailable, structure the prompt directly via Workers AI
    console.warn("[Jules] Primary step failed, falling back to Workers AI structuring:", e);
    julesText = prompt;
  }

  // Step 2: Workers AI structures Jules text into Zod schema.
  // System prompt pulled from D1 agent-config — not hardcoded.
  const agentName = options?.agentName ?? "Jules";
  const functionName = options?.functionName ?? "structureResponse";
  const aiProvider = new AIProvider(env);
  const config = await aiProvider.getAgentFunctionConfig(agentName, functionName);

  const structuringSystemPrompt =
    config?.systemInstructions ??
    "Extract and format the input text into the JSON schema provided. Output only valid JSON.";

  const { object } = await generateObject({
    model: createWorkersAI({ binding: env.AI })(STRUCTURING_MODEL), // @cf/meta/llama-4-scout-17b-16e-instruct
    schema,
    system: structuringSystemPrompt,
    prompt: `TEXT TO STRUCTURE:\n${julesText}`,
  });

  return object;
}
```

`STRUCTURING_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"` — defined in `vendors/worker-ai.ts`.

---

## 5. CollaborationSpace (Repurposed from ChatRoom)

`CollaborationSpace` extends `BaseChatAgent` (WebSocket for agent broadcast). Repurposed from `ChatRoom/index.ts`.

### RPC Interface
```typescript
export class CollaborationSpace extends BaseChatAgent {
  readonly agentName = "CollaborationSpace";

  @callable()
  async openSession(sessionId: string, initiator: string, repoOwner?: string, repoName?: string): Promise<void>

  @callable()
  async addCollaborator(agentName: string, assignment: string, triggerCondition: string): Promise<void>

  @callable()
  async postMessage(from: string, content: string, metadata?: Record<string, unknown>): Promise<void>

  @callable()
  async triggerCollaborator(agentName: string, prompt: string): Promise<void>

  @callable()
  async getEvents(limit?: number): Promise<CollabEvent[]>

  @callable()
  async closeSession(outcome: string): Promise<void>
}
```

### D1 Schema
New file: `db/schemas/agents/collaborations.ts`

```sql
CREATE TABLE collaboration_sessions (
  id TEXT PRIMARY KEY,
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
  status TEXT NOT NULL DEFAULT 'waiting',
  joined_at TEXT NOT NULL
);

CREATE TABLE collaboration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES collaboration_sessions(id),
  from_agent TEXT NOT NULL,
  event_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  ts TEXT NOT NULL
);
```

### Usage Pattern
```typescript
// In EngineerAgent — open a silo'd collaboration for a Jules coding task
const sessionId = crypto.randomUUID();
const space = await getAgentByName(this.env.COLLABORATION_SPACE, sessionId);

await space.openSession(sessionId, "EngineerAgent", repoOwner, repoName);
await space.addCollaborator("GuardrailAgent", "Audit Jules output for code standards", "jules_task_complete");
await space.addCollaborator("CloudflareAgent", "Scan wrangler bindings and create missing ones", "immediately");

await this.keepAliveWhile(() => waitForCollaborationComplete(sessionId));
```

---

## 6. HITL Queue Service

**V3 CORRECTION #3**: Schema lives at `db/schemas/workflows/hitl.ts` (already exists — DO NOT recreate).

All GitHub webhooks enqueue proposals instead of auto-executing.

```typescript
// agent-support/hitl-queue.ts
export class HitlQueue {
  constructor(private env: Env) {}

  async propose(params: {
    type: string;
    proposedAction: string;
    proposedMarkdown: string;
    payload: unknown;
    repoOwner?: string;
    repoName?: string;
    agentName?: string;
  }): Promise<string>  // returns hitlId

  async approve(hitlId: string, userId: string): Promise<void>
  async reject(hitlId: string, userId: string, reason: string): Promise<void>
  async iterate(hitlId: string, feedback: string): Promise<string>
  async list(filters?: HitlFilters): Promise<HitlProposal[]>
  async get(hitlId: string): Promise<HitlProposal>
}
```

**Import the existing schema** — do not duplicate it:
```typescript
// In hitl-queue.ts:
import { hitlProposals, hitlRevisions, hitlDecisions } from "../../../db/schemas/workflows/hitl";
// ↑ V3 CORRECTION: workflows/, not agents/
```

### Webhook Handler Change
```typescript
// routes/api/webhooks/index.ts — AFTER: queue instead of auto-trigger
const hitlId = await new HitlQueue(env).propose({
  type: `webhook:${githubEvent}`,
  proposedAction: buildActionSummary(githubEvent, payload),
  proposedMarkdown: buildProposalMarkdown(githubEvent, payload),
  payload,
  repoOwner: payload.repository?.owner?.login,
  repoName: payload.repository?.name,
});

return c.json({ status: "queued", hitlId }, 202);
```

---

## 7. Health Architecture

### Three Layers
1. **Base checks** (both base classes) — bindings, D1 availability, EDGRAPH presence
2. **Per-agent checks** (`agentHealth()` override) — agent-specific: D1 queries, API tokens, cache warmth
3. **Chat format** (`BaseChatAgent` only) — `verifyChatFormat()` — **static checks ONLY** (see §3.2)

**Anti-pattern to avoid:** calling `generateText` or `streamText` inside `verifyChatFormat()`. This exhausts AI rate limits and can cascade-fail when the health coordinator calls all 10 agents.

### `agentHealth()` Implementations (Per Agent)
```typescript
// GuardrailAgent — verify D1 rule cache
protected async agentHealth() {
  const rules = await getDb(this.env.DB).select().from(guardrailRules).limit(1);
  const checks = rules.length > 0 ? ["d1_rules:ok"] : ["d1_rules:empty"];
  const cache = await this.ctx.storage.get("ruleCache");
  checks.push(cache ? "rule_cache:warm" : "rule_cache:cold");
  return checks;
}

// CloudflareAgent — verify API token (lightweight call)
protected async agentHealth() {
  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${(this.env as any).CLOUDFLARE_API_TOKEN}` }
    });
    return [resp.ok ? "cf_api:ok" : "cf_api:fail"];
  } catch { return ["cf_api:error"]; }
}

// OrchestratorAgent — ping each sibling agent
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
```

### Health Coordinator Integration
```typescript
// health/coordinator.ts — add to existing checks
const agentBindings = [
  { name: "OrchestratorAgent", binding: env.ORCHESTRATOR_AGENT, isFrontend: true },
  { name: "ResearchAgent",     binding: env.RESEARCH_AGENT,     isFrontend: true },
  { name: "CloudflareAgent",   binding: env.CLOUDFLARE_AGENT,   isFrontend: true },
  { name: "EngineerAgent",     binding: env.ENGINEER_AGENT,     isFrontend: false },
  { name: "GithubAgent",       binding: env.GITHUB_AGENT,       isFrontend: false },
  { name: "GuardrailAgent",    binding: env.GUARDRAIL_AGENT,    isFrontend: false },
  { name: "LearningAgent",     binding: env.LEARNING_AGENT,     isFrontend: false },
  { name: "WorkshopAgent",     binding: env.WORKSHOP_AGENT,     isFrontend: false },
  { name: "DesignAgent",       binding: env.DESIGN_AGENT,       isFrontend: false },
  { name: "OverseerAgent",     binding: env.OVERSEER_AGENT,     isFrontend: false },
];

for (const { name, binding, isFrontend } of agentBindings) {
  checks.push({
    name: `agent:${name}`,
    run: async () => {
      const stub = await getAgentByName(binding, "health-probe");
      const result = await stub.healthProbe();
      if (isFrontend && !result.capabilities.includes("assistant_ui_stream_compatible")) {
        return { status: "fail", detail: "Missing stream compatibility" };
      }
      return { status: result.status, detail: result.capabilities };
    }
  });
}
```

---

## 8. AgentStateStore — D1 Mirror

`state-store.ts` gains D1 mirror on every `set()` and `patch()`. `agentStateMirror` table **already exists** in `db/schemas/agents/mirror.ts`.

```typescript
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

---

## 9. File Structure (Definitive)

```
src/backend/src/
├── ai/
│   ├── agents/
│   │   ├── ChatRoom.ts                    ← DELETE (legacy root duplicate)
│   │   ├── CollaborationSpace/            ← RENAME from ChatRoom/
│   │   │   └── index.ts                   ← CollaborationSpace extends BaseChatAgent
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
│       ├── methods/generation.ts           ← skill injection in all generation methods
│       ├── vendors/jules.ts                ← V3: two-step w/ getAgentFunctionConfig step-2 prompt
│       └── agent-support/
│           ├── index.ts                    ← barrel exports
│           ├── base-agent.ts               ← NEW: BaseAgent abstract
│           ├── base-chat-agent.ts          ← NEW: BaseChatAgent (imports from "agents")
│           ├── skills.ts                   ← NEW: SkillManager (D1-backed)
│           ├── hitl-queue.ts               ← NEW: HitlQueue service
│           ├── collaboration.ts            ← NEW: CollaborationService
│           ├── health-base.ts              ← NEW: shared base health checks
│           └── state-store.ts              ← MODIFY: add D1 mirror
│
├── db/
│   ├── schemas/
│   │   ├── agents/
│   │   │   ├── mirror.ts                   ← EXISTING: agentStateMirror (no change)
│   │   │   └── collaborations.ts           ← NEW: collaboration_sessions/participants/events
│   │   └── workflows/
│   │       └── hitl.ts                     ← EXISTING — import from here, do NOT recreate
│   └── services/agent-config/seed.ts       ← ADD: missing agent/function entries (from audit)
│
├── routes/api/
│   ├── webhooks/index.ts                   ← MODIFY: HITL propose instead of auto-trigger
│   └── hitl.ts                             ← NEW: GET/POST approve/reject/iterate
│
└── health/coordinator.ts                   ← ADD: per-agent health checks
```

**Delete after migration (confirm no imports first):**
- `ai/agents/ChatRoom.ts` (root legacy)
- `services/octokit/skill-fetcher.ts` (replaced by SkillManager)

---

## 10. Verification

```bash
# 1. TypeScript — zero errors
npx tsc --noEmit

# 2. Dry-run — all DO bindings resolve (including CollaborationSpace)
pnpm run dry-run

# 3. Health endpoint — all agents present, isFrontendFacing respected
curl /health | jq '.checks | map(select(.name | startswith("agent:")))'
# OrchestratorAgent, ResearchAgent, CloudflareAgent → must include "assistant_ui_stream_compatible"
# EngineerAgent, GithubAgent etc. → isFrontendFacing: false

# 4. Skill injection — trigger OrchestratorAgent.submitBrief, check Worker logs
# Expect: <skill_context> block in logged systemPrompt

# 5. Jules two-step — call generateStructuredResponse with provider='jules'
# Expect: D1 step-2 system prompt loaded via getAgentFunctionConfig, STRUCTURING_MODEL used

# 6. CollaborationSpace round-trip
# EngineerAgent opens session → D1 collaboration_sessions row created
# triggerCollaborator → collaboration_events row + target agent RPC called

# 7. HITL round-trip
# POST /api/webhooks with PR event → hitl_proposals row (pending), 202 response
# POST /api/hitl/:id/approve → hitl_decisions row, deferred action executes

# 8. Frontend chat (BaseChatAgent agents only)
# useAgentChat() from assistant-ui → OrchestratorAgent → streaming response
# healthProbe capabilities must include "assistant_ui_stream_compatible"
```
