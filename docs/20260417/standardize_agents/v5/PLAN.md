# Standardize Agents — Architecture Plan v5

**Date:** 2026-04-17  
**Supersedes:** `docs/20260417/standardize_agents/v4/PLAN.md`  
**Integrates:** `docs/20260417/standardize_agents/implementation_plan_skills.md`  
**All previous content:** v4 is fully included — v5 adds enhanced skills architecture only.

---

## What Changed from v4

v4 had a basic `SkillManager` that read from D1 on every call and passed skills via `options.skills`. v5 adds:

| Addition | Detail |
|----------|--------|
| **Two-pathway skills architecture** | Static (hardcoded class constant, prefetched) vs Dynamic (from assistant-ui request header) — formally defined and implemented |
| **Enhanced SkillManager** | In-memory cache with TTL, `prefetch()`, `validate()`, `resolveEffective()` |
| **`BaseChatAgent.onRequest()` override** | Extracts `X-Agent-Skills` header before routing to `onChatMessage` — stores in `_requestSkills` |
| **`BaseChatAgent.onChatMessage()` enhancement** | Computes effective skill set = dedupe(static + dynamic), passes to generation |
| **`clients/vercel/chat/tools.ts` skill passthrough** | Confirms `options.skills` flows from `VercelOptions` through all 5 vercel chat functions into `methods/generation.ts` injection |
| **`VercelOptions` skill context field** | Add `skillContext?: string` to `VercelOptions` for pre-resolved skill content (avoids double D1 fetch in two-step generation) |
| **Skill validation in development** | `SkillManager.validate()` warns on unknown skill names during `agentInit()` |
| **Frontend protocol** | `X-Agent-Skills: skill-a,skill-b` HTTP header — defined, documented, and wired end-to-end |
| **Skill cache warm in onStart()** | `BaseAgent.onStart()` fires `ctx.waitUntil(ai.warmSkillCache(this.skills))` so first message has cache hits |

---

## Non-Negotiable Rules (Same as v4, Repeated for Reference)

1. `import { AIChatAgent } from "agents"` — never `@cloudflare/ai-chat` in backend
2. `verifyChatFormat()` — static checks only, no live inference
3. HITL schema at `db/schemas/workflows/hitl.ts`
4. Jules step-2 system prompt from `getAgentFunctionConfig()`
5. `AgentStateStore` uses object-param constructor
6. `onChatMessage()` hook — not `onMessage()`
7. `keepAliveWhile()` for long-running tasks
8. `@callable()` signatures immutable
9. Never `agent.fetch(new Request(...))`
10. All AI calls through `this.ai`
11. Grep before deleting
12. OverseerAgent dissolved — not migrated

---

## 1. Skills Architecture (Enhanced — v5 Focus)

### 1.1 Two Pathways

> **Both BaseAgent and BaseChatAgent have full, first-class skills support via the Static Pathway.** The Dynamic Pathway (X-Agent-Skills header) is the ONLY skills feature exclusive to BaseChatAgent. Many skills — `jules-stitch-loop`, `code-generation`, `pr-review`, `sprint-planning` — are backend-only and will never be requested via the chat frontend. These are purely `BaseAgent` concerns.

```
STATIC PATHWAY — BaseAgent example (backend-only skills, @callable() context)
───────────────────────────────────────────────────────────────────────────────
// EngineerAgent: executes Jules sessions — knows how to code, not how to loop
class EngineerAgent extends BaseAgent {
  protected readonly skills = ['jules-orchestration', 'code-generation', 'code-review'];
  //   ↑ prefetched into SkillManager cache during onStart() via ctx.waitUntil()

  @callable()
  async overseeJules(sessionId: string, designSpecs?: string) {
    const config = await this.ai.getAgentFunctionConfig(this.agentName, "overseeJules");
    // skills retrieved from in-memory cache — no D1 round-trip
    return this.keepAliveWhile(() =>
      this.ai.generateStructuredResponse(prompt, schema, {
        skills: this.skills    // ← identical mechanism to chat agents
      })
    );
  }
}

// DesignAgent: executes Stitch — knows how to design, not how to loop
class DesignAgent extends BaseAgent {
  protected readonly skills = ['stitch-pipeline', 'ui-design', 'component-spec'];

  @callable()
  async runStitch(brief: string, context?: string) {
    return this.ai.generateStructuredResponse(prompt, schema, {
      skills: this.skills       // ← Stitch-specific instructions injected
    });
  }
}

// WorkshopAgent: orchestrates the jules-stitch-loop — knows how to sequence both
class WorkshopAgent extends BaseAgent {
  protected readonly skills = ['workshop-facilitation', 'jules-stitch-loop', 'spec-generation'];

  @callable()
  async runWorkshop(brief: string) {
    // AI generation with jules-stitch-loop skill tells the model HOW to orchestrate
    const plan = await this.ai.generateStructuredResponse(brief, config?.systemInstructions, {
      skills: this.skills
    });
    // Then calls sub-agents via @callable() RPC:
    const design = await this.designAgent.runStitch(brief, plan.specs);
    const impl = await this.engineerAgent.overseeJules(plan.sessionId, design.artifacts);
    // ...evaluate, loop if needed
  }
}

STATIC PATHWAY — BaseChatAgent example (frontend chat context)
───────────────────────────────────────────────────────────────
class OrchestratorAgent extends BaseChatAgent {
  protected readonly skills = ['plan-writing', 'architecture', 'task-management'];
  //   ↑ same prefetch in onStart(), same SkillManager, same cache

  // onChatMessage() is the hook — skills are injected into systemPrompt automatically
}

DYNAMIC PATHWAY — BaseChatAgent ONLY (X-Agent-Skills from assistant-ui)
─────────────────────────────────────────────────────────────────────────
assistant-ui frontend sends:
  POST /agents/OrchestratorAgent/{session-id}
  Header: X-Agent-Skills: brainstorming,source-evaluation   ← user-selected at runtime

BaseChatAgent.onRequest() extracts header:
  this._requestSkills = ["brainstorming", "source-evaluation"]

BaseChatAgent.onChatMessage() merges static + dynamic:
  effectiveSkills = dedupe([...this.skills, ...this._requestSkills])
  //   = ['plan-writing', 'architecture', 'task-management', 'brainstorming', 'source-evaluation']
  //   ↓ cache hit (static already warm, dynamic fetched once and cached)
  //   ↓ injected into systemPrompt as <skill_context> block

// BaseAgent subclasses NEVER receive X-Agent-Skills — they have no HTTP chat endpoint
```

### 1.2 Enhanced SkillManager

**File:** `ai/providers/agent-support/skills.ts`

```typescript
export class SkillManager {
  // In-memory cache lives for DO lifetime (session-scoped, typically 30s–10min)
  private readonly cache = new Map<string, { content: string; cachedAt: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly env: Env) {}

  /**
   * Core method: fetch skill instructions from D1, with in-memory cache.
   * Returns empty string for empty arrays — no D1 round-trip.
   * Non-fatal: D1 failure returns "" with console.warn.
   */
  async getSkillInstructions(skillNames: string[]): Promise<string> {
    if (!skillNames.length) return "";
    const now = Date.now();
    const hits: string[] = [];
    const misses: string[] = [];

    for (const name of skillNames) {
      const entry = this.cache.get(name);
      if (entry && now - entry.cachedAt < this.CACHE_TTL) {
        hits.push(entry.content);
      } else {
        misses.push(name);
      }
    }

    if (misses.length) {
      try {
        const rows = await getDb(this.env.DB)
          .select({ name: agentSkills.name, content: agentSkills.markdownContent })
          .from(agentSkills)
          .where(inArray(agentSkills.name, misses));

        for (const row of rows) {
          this.cache.set(row.name, { content: row.content, cachedAt: now });
          hits.push(row.content);
        }

        // Warn on missing skill names (typos, deleted skills)
        const found = new Set(rows.map(r => r.name));
        const unknown = misses.filter(n => !found.has(n));
        if (unknown.length) {
          console.warn(`[SkillManager] Unknown skill names (not in D1): ${unknown.join(", ")}`);
        }
      } catch (e) {
        console.warn("[SkillManager] D1 fetch failed (non-fatal):", e);
        return hits.length > 0 ? this.wrap(hits) : "";
      }
    }

    return hits.length > 0 ? this.wrap(hits) : "";
  }

  /**
   * Prefetch skills into cache without returning content.
   * Called from BaseAgent.onStart() via ctx.waitUntil() — non-blocking.
   */
  async prefetch(skillNames: string[]): Promise<void> {
    if (!skillNames.length) return;
    await this.getSkillInstructions(skillNames); // side effect: populates cache
  }

  /**
   * Validate skill names against D1. Returns valid/missing sets.
   * Called in agentInit() during development for fast feedback on typos.
   */
  async validate(skillNames: string[]): Promise<{ valid: string[]; missing: string[] }> {
    if (!skillNames.length) return { valid: [], missing: [] };
    try {
      const rows = await getDb(this.env.DB)
        .select({ name: agentSkills.name })
        .from(agentSkills)
        .where(inArray(agentSkills.name, skillNames));
      const found = new Set(rows.map(r => r.name));
      return {
        valid: skillNames.filter(n => found.has(n)),
        missing: skillNames.filter(n => !found.has(n)),
      };
    } catch {
      return { valid: skillNames, missing: [] }; // non-fatal — assume valid on D1 error
    }
  }

  /**
   * Merge static (agent class constant) and dynamic (user-selected from request)
   * skills, deduplicate, and return effective set.
   */
  resolveEffective(staticSkills: string[], dynamicSkills: string[]): string[] {
    return [...new Set([...staticSkills, ...dynamicSkills])];
  }

  private wrap(contents: string[]): string {
    return `<skill_context>\n${contents.join("\n\n---\n\n")}\n</skill_context>`;
  }
}
```

### 1.3 AIProvider Integration

`AIProvider` exposes `SkillManager` as a public property:

```typescript
export class AIProvider {
  public readonly skills: SkillManager;

  constructor(env: Env) {
    // ... other init ...
    this.skills = new SkillManager(env);
  }

  // Convenience method for BaseAgent.onStart()
  async warmSkillCache(skillNames: string[]): Promise<void> {
    await this.skills.prefetch(skillNames);
  }
}
```

### 1.4 BaseAgent — Skill Cache Warming

`BaseAgent.onStart()` fires a non-blocking skill prefetch after `agentInit()`:

```typescript
async onStart() {
  const env = this.env as any;
  this.logger = new Logger(env, this.agentName);
  this.ai = new AIProvider(env);
  // ... other init ...
  await this.agentInit?.();

  // Warm skill cache for agent's static skills (non-blocking)
  // First message will get cache hits instead of D1 round-trips
  if (this.skills.length) {
    this.ctx.waitUntil(
      this.ai.warmSkillCache(this.skills).catch(e =>
        this.logger.warn("Skill cache warm failed (non-fatal):", e)
      )
    );
  }

  this.logger.info(`${this.agentName} initialized`);
}
```

### 1.5 BaseChatAgent — Dynamic Skills via X-Agent-Skills Header

`BaseChatAgent` intercepts the incoming request to extract selected skills BEFORE routing to `onChatMessage`. This avoids body consumption issues (header-only approach):

```typescript
export abstract class BaseChatAgent<Env extends object = object> extends AIChatAgent<Env> {
  // ...

  // Populated by onRequest() for the current request — reset each time
  private _requestSkills: string[] = [];

  /**
   * Override onRequest to extract X-Agent-Skills header before routing
   * to AIChatAgent's standard message processing pipeline.
   */
  async onRequest(request: Request): Promise<Response> {
    const skillHeader = request.headers.get("X-Agent-Skills");
    if (skillHeader) {
      this._requestSkills = skillHeader
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      this._requestSkills = [];
    }
    return super.onRequest(request);
  }

  /**
   * Overrides the AIChatAgent message hook.
   * Computes effective skills = dedupe(static + dynamic) and passes to generation.
   */
  async onChatMessage(onFinish: (messages: any[]) => void) {
    await this.ensureReady();

    // Merge static (class-level) + dynamic (request header) skills
    const effectiveSkills = this.ai.skills.resolveEffective(
      this.skills,
      this._requestSkills
    );

    const config = await this.ai.getAgentFunctionConfig(this.agentName, "onChatMessage");
    const workersai = createWorkersAI({ binding: (this.env as any).AI });

    const result = streamText({
      model: workersai(config?.primaryModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: config?.systemInstructions,
      messages: await convertToModelMessages(this.messages),
      onFinish: ({ response }) => onFinish(response.messages),
    });

    // Skills injected via options.skills through the generation pipeline
    // NOTE: The streamText here goes through this.ai's generation methods
    // which intercept options.skills. For direct streamText calls, pass skills
    // as a system prompt appendage from SkillManager directly:
    if (effectiveSkills.length) {
      const skillCtx = await this.ai.skills.getSkillInstructions(effectiveSkills);
      // skillCtx is already in cache from prefetch — no D1 hit
      if (skillCtx) {
        // Rebuild with augmented system prompt
        const augmentedSystem = [config?.systemInstructions, skillCtx]
          .filter(Boolean)
          .join("\n\n");
        const augmented = streamText({
          model: workersai(config?.primaryModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
          system: augmentedSystem,
          messages: await convertToModelMessages(this.messages),
          onFinish: ({ response }) => onFinish(response.messages),
        });
        return augmented.toUIMessageStreamResponse();
      }
    }

    return result.toUIMessageStreamResponse();
  }
}
```

**Note on the pattern above:** The `BaseChatAgent.onChatMessage` calls `streamText` directly (not through `this.ai.generateText`) because `AIChatAgent` needs the response in `toUIMessageStreamResponse()` format. The skill injection happens explicitly here rather than via the `methods/generation.ts` interception path. This is intentional — `onChatMessage` is the only place where `streamText` is called outside the standard generation method pipeline.

### 1.6 Frontend Protocol — X-Agent-Skills Header

**Definition:** Assistant-ui sends `X-Agent-Skills: skill-name-1,skill-name-2` as an HTTP request header on each chat POST.

**Frontend usage (assistant-ui `useAgentChat`):**
```typescript
// In the React component that renders the chat:
const { sendMessage } = useAgentChat({
  agent: orchestratorAgent,
  // Static skills the user has selected from the skill picker UI:
  headers: selectedSkills.length > 0
    ? { "X-Agent-Skills": selectedSkills.join(",") }
    : undefined,
});
```

**Rules:**
- Header value is comma-separated skill names — same names as `agent_skills.name` in D1
- Empty header or absent header = use only agent's static skills
- Header skills are merged with static skills (union, deduplicated)
- Frontend can list all available skills from `GET /api/ai/skills` (the existing skills API)
- Backend never trusts skill names blindly — `SkillManager.getSkillInstructions` only fetches skills that exist in D1; unknown names produce a warning and empty string

**Skill name format:** lowercase, hyphen-separated (e.g., `plan-writing`, `deep-research`, `cloudflare-docs`)

### 1.7 Vercel Chat Client Skill Passthrough

The vercel chat clients (`clients/vercel/chat/text.ts`, `tools.ts`, `structured.ts`) already receive `options?: VercelOptions` which extends `AIOptions`. Since `AIOptions` will have `skills?: string[]`, and the injection happens in `methods/generation.ts` BEFORE the vercel client is called, the flow is:

```
Agent method → this.ai.generateText(prompt, system, { skills: [...] })
  → methods/generation.ts:generateTextImpl()
    → intercepts options.skills
    → calls SkillManager.getSkillInstructions() (cache hit)
    → appends <skill_context> to systemPrompt
    → calls createVercelOpenAIClient() / createWorkersAI()
      → passes augmented systemPrompt to model
```

No changes needed to the vercel client files themselves — the interception in `methods/generation.ts` is sufficient. However, add `skillContext?: string` to `VercelOptions` as an escape hatch for callers who have pre-resolved skill content:

```typescript
// clients/vercel/types.ts
export interface VercelOptions extends AIOptions {
  maxSteps?: number;
  skillContext?: string;  // Pre-resolved skill content (bypasses SkillManager D1 fetch)
}
```

This is useful in the Jules two-step where we want to avoid a double D1 fetch: step 1 resolves skills, step 2 can pass the already-resolved `skillContext` string directly.

---

## 2. Agent Taxonomy (Same as v4)

| Agent | Base Class | Skills | Role in Jules-Stitch Loop |
|-------|------------|--------|---------------------------|
| OrchestratorAgent | `BaseChatAgent` | `plan-writing`, `architecture`, `task-management` | — |
| ResearchAgent | `BaseChatAgent` | `deep-research`, `brainstorming`, `source-evaluation` | — |
| CloudflareAgent | `BaseChatAgent` | `cloudflare-docs`, `workers-architecture`, `binding-provisioning` | **Consulted** by EngineerAgent (binding needs) and GuardrailAgent (CF best practices) |
| EngineerAgent | `BaseAgent` | `jules-orchestration`, `code-generation`, `code-review` | **Executes Jules** — gets binding config from CloudflareAgent, passes to Jules |
| GithubAgent | `BaseAgent` | `pr-review`, `code-analysis`, `repo-management` | — |
| GuardrailAgent | `BaseAgent` | `golden-path`, `code-standards`, `cloudflare-standards` | **Monitors quality** — consults CloudflareAgent for CF-specific validation |
| LearningAgent | `BaseAgent` | `ci-healing`, `incident-analysis`, `root-cause` | — |
| WorkshopAgent | `BaseAgent` | `workshop-facilitation`, `jules-stitch-loop`, `spec-generation` | **Orchestrates the loop** — coordinates all agents via `@callable()` |
| DesignAgent | `BaseAgent` | `stitch-pipeline`, `ui-design`, `component-spec` | **Executes Stitch** — generates UI mockups and design specs |
| CollaborationSpace | `BaseChatAgent` | (context-dependent; no static skills) | — |
| OverseerAgent | **DISSOLVED** | absorbed into EngineerAgent + GuardrailAgent | — |

### Jules-Stitch Loop — Full Agent Interaction Model

```
WorkshopAgent.runWorkshop(brief)                    ← @callable() entry point
  │
  │  AI: skills: ['workshop-facilitation', 'jules-stitch-loop', 'spec-generation']
  │  → Produces: structured plan, acceptance criteria, iteration budget
  │
  ├─→ DesignAgent.runStitch(brief, specs)           ← @callable() RPC
  │     AI: skills: ['stitch-pipeline', 'ui-design', 'component-spec']
  │     → Stitch MCP generates UI mockups + component specs
  │     → Returns: { artifacts, componentList, bindingHints }
  │
  ├─→ CloudflareAgent.analyzeBindingNeeds(specs)    ← @callable() RPC
  │     AI: skills: ['cloudflare-docs', 'workers-architecture', 'binding-provisioning']
  │     → Queries Cloudflare Docs MCP for implementation details
  │     → Determines: D1, KV, R2, AI gateway, queues, etc. required for project
  │     → Returns: bindingDefinitions[]
  │
  ├─→ CloudflareAgent.provisionBindings(defs)       ← @callable() RPC
  │     → Creates actual bindings in Cloudflare via CF API
  │     → Returns: wranglerConfigFragment (ready to merge into wrangler.jsonc)
  │
  ├─→ EngineerAgent.overseeJules(session, {         ← @callable() RPC
  │       designSpecs,                               (passes binding config from CF step)
  │       bindingConfig,                             Jules receives: "Add these to wrangler.jsonc:
  │       componentList                               { d1_databases: [...], kv_namespaces: [...] }"
  │     })                                           Jules implements code + writes bindings
  │     AI: skills: ['jules-orchestration', 'code-generation', 'code-review']
  │     → keepAliveWhile(julesSession.run())
  │     → Returns: { prUrl, implementedComponents, wranglerUpdated: true }
  │
  ├─→ GuardrailAgent.reviewImplementation(prUrl)    ← @callable() RPC (runs concurrently with Jules)
  │     AI: skills: ['golden-path', 'code-standards', 'cloudflare-standards']
  │     │
  │     ├─→ CloudflareAgent.validateImplementation(  ← @callable() consult
  │     │       code, bindingConfig)
  │     │     → Checks CF-specific best practices (D1 batch, KV limits, etc.)
  │     │     → Returns: { ok, violations[], suggestions[] }
  │     │
  │     → Returns: { approved, violations[], requiredFixes[] }
  │
  └─→ WorkshopAgent evaluates:
        if (guardrail.approved && impl.wranglerUpdated) → DONE
        else → loop: DesignAgent refine → EngineerAgent fix → GuardrailAgent re-review
        → terminates when approved or iteration budget exhausted
```

> **Skill ownership:** `jules-stitch-loop` belongs on WorkshopAgent — it encodes the orchestration pattern (sequencing, evaluation, iteration logic). CloudflareAgent owns `binding-provisioning` (knows how to provision CF resources and what bindings are appropriate for worker patterns). GuardrailAgent owns `cloudflare-standards` (knows CF-specific best practices) but *consults* CloudflareAgent for live doc lookups. EngineerAgent and DesignAgent know only their own execution domain.

> **CloudflareAgent dual-role:** Although `BaseChatAgent` (retains user-facing chat for CF investigations), CloudflareAgent exposes `@callable()` methods for backend-agent consultation: `analyzeBindingNeeds()`, `provisionBindings()`, `validateImplementation()`. Both modes coexist — `AIChatAgent` (from `"agents"`) supports `@callable()` on the same class.

> Backend-only skills like `stitch-pipeline`, `jules-orchestration`, `jules-stitch-loop`, and `binding-provisioning` will never appear on the `X-Agent-Skills` header from the frontend.

---

## 3. BaseAgent — Full Implementation (v5)

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

    // Warm skill cache non-blocking — first message gets cache hits
    if (this.skills.length) {
      this.ctx.waitUntil(
        this.ai.warmSkillCache(this.skills).catch(e =>
          this.logger.warn("Skill cache warm failed (non-fatal):", e)
        )
      );
    }

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
    const capabilities: string[] = [
      "bindings_ok",
      "state_store_mirrored",
      `skills_configured:${this.skills.length}`,
    ];
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

---

## 4. BaseChatAgent — Full Implementation (v5)

See §1.5 for the key skills additions. Full class below:

```typescript
import { AIChatAgent } from "agents"; // ← BACKEND class from "agents" — NOT "@cloudflare/ai-chat"
import { streamText, convertToModelMessages } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { callable } from "agents";
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

  private _requestSkills: string[] = [];

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

    // Warm static skill cache (non-blocking)
    if (this.skills.length) {
      this.ctx.waitUntil(
        this.ai.warmSkillCache(this.skills).catch(e =>
          this.logger.warn("Skill cache warm failed (non-fatal):", e)
        )
      );
    }

    this.logger.info(`${this.agentName} (chat) initialized`);
  }

  protected async ensureReady() {
    if (!this.ai) await this.onStart();
  }

  /**
   * Extract X-Agent-Skills header before AIChatAgent processes the request.
   * Skills are stored in _requestSkills for use in onChatMessage.
   */
  async onRequest(request: Request): Promise<Response> {
    const skillHeader = request.headers.get("X-Agent-Skills");
    this._requestSkills = skillHeader
      ? skillHeader.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    return super.onRequest(request);
  }

  /**
   * Default onChatMessage — subclasses override with their own model/system prompt.
   * Merges static + dynamic skills and injects into systemPrompt.
   */
  async onChatMessage(onFinish: (messages: any[]) => void) {
    await this.ensureReady();

    const config = await this.ai.getAgentFunctionConfig(this.agentName, "onChatMessage");
    const env = this.env as any;
    const workersai = createWorkersAI({ binding: env.AI });

    // Merge static class skills + dynamic request skills (deduplicated)
    const effectiveSkills = this.ai.skills.resolveEffective(this.skills, this._requestSkills);

    // Fetch skill content (cache hit if prefetch completed in onStart)
    const skillCtx = effectiveSkills.length
      ? await this.ai.skills.getSkillInstructions(effectiveSkills)
      : "";

    const systemPrompt = [config?.systemInstructions, skillCtx]
      .filter(Boolean)
      .join("\n\n") || undefined;

    const result = streamText({
      model: workersai(config?.primaryModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: systemPrompt,
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
      `skills_configured:${this.skills.length}`,
    ];
    let status = "ok";

    // Static checks ONLY — no live inference
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

    return { agent: this.agentName, status, timestamp: Date.now(), capabilities, isFrontendFacing: true };
  }

  // Static shape-check — AbortSignal.timeout(0) cancels before any inference
  private async verifyChatFormat(): Promise<{ ok: boolean; error?: string }> {
    try {
      const env = this.env as any;
      if (!env.AI) return { ok: false, error: "env.AI binding missing" };
      if (!Array.isArray(this.messages)) return { ok: false, error: "this.messages not initialized" };
      const workersai = createWorkersAI({ binding: env.AI });
      const probe = streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
        prompt: "__probe__",
        abortSignal: AbortSignal.timeout(0),
      });
      if (typeof probe.toUIMessageStreamResponse !== "function") {
        return { ok: false, error: "toUIMessageStreamResponse not a function — ai-sdk mismatch" };
      }
      return { ok: true };
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.message?.includes("aborted")) return { ok: true };
      return { ok: false, error: e.message };
    }
  }
}
```

---

## 5. AIOptions and VercelOptions (v5 Final)

```typescript
// ai/providers/types.ts
export interface AIOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  skills?: string[];        // Static or dynamic skill names → injected as <skill_context>
}

// ai/providers/clients/vercel/types.ts
export interface VercelOptions extends AIOptions {
  maxSteps?: number;
  skillContext?: string;   // Pre-resolved skill content — bypasses SkillManager D1 fetch
                           // Useful in Jules two-step to avoid double D1 round-trip
}
```

---

## 6. skills.ts Injection in methods/generation.ts (v5 Final)

The injection block at the top of every generation function:

```typescript
// At the top of generateTextImpl (and all 5 other generation functions):
if (options?.skills?.length) {
  const sm = new SkillManager(ai.env);
  const ctx = await sm.getSkillInstructions(options.skills);  // cache hit after prefetch
  if (ctx) systemPrompt = [systemPrompt, ctx].filter(Boolean).join("\n\n");
} else if ((options as VercelOptions)?.skillContext) {
  // Pre-resolved skill context (Jules two-step, avoid double fetch)
  systemPrompt = [systemPrompt, (options as VercelOptions).skillContext].filter(Boolean).join("\n\n");
}
```

---

## 7. All Phases (v4 content, unchanged)

### Phase 0: Audit
*(same as v4 — P0-AUDIT)*

### Phase 1: Foundation
All v4 Phase 1 tasks, plus:
- **P1-SKILLMANAGER-ENHANCED** (replaces P1-SKILLMANAGER) — full SkillManager with cache, validate, prefetch, resolveEffective
- **P1-AI-PROVIDER-SKILLS-API** — expose `skills: SkillManager` and `warmSkillCache()` on AIProvider
- **P1-SKILL-PROTOCOL** — define `X-Agent-Skills` header protocol; add header extraction to BaseChatAgent; add `skillContext?: string` to VercelOptions
- **P1-VERCEL-TYPES** — add `skillContext?: string` to VercelOptions; update generation.ts to handle `skillContext` bypass
- Updated **P1-BASE-AGENT** — add skill cache warm in `onStart()`
- Updated **P1-BASE-CHAT-AGENT** — add `onRequest()` override + `_requestSkills` + `resolveEffective()` in `onChatMessage()`

### Phase 2: Pre-Migration Cleanup
*(same as v4)*

### Phase 3: Agent Migration
*(same as v4, plus: each agent's `skills` array is now prefetched and cache-warmed automatically)*

### Phase 4: Integration, Routes, Wrangler Reset
*(same as v4)*

### Phase 5: Chat Migration
*(same as v4)*

### Phase 6: Final Verification
*(same as v4, plus skills-specific checks — see verification section)*

---

## 8. File Structure (New/Changed in v5 vs v4)

```
src/backend/src/
└── ai/
    └── providers/
        ├── index.ts                          ← ADD: warmSkillCache(), expose skills: SkillManager
        ├── types.ts                          ← ADD: skills?: string[] to AIOptions
        ├── methods/generation.ts            ← ADD: skillContext bypass path
        ├── clients/vercel/types.ts          ← ADD: skillContext?: string to VercelOptions
        └── agent-support/
            ├── skills.ts                    ← ENHANCED: cache, prefetch, validate, resolveEffective
            ├── base-agent.ts               ← ADD: skill cache warm in onStart()
            └── base-chat-agent.ts          ← ADD: onRequest() header extraction, resolveEffective in onChatMessage
```

---

## 9. Verification (v5 Additions)

In addition to all v4 verification checks:

```bash
# Skills static pathway
# Trigger OrchestratorAgent.submitBrief — expect <skill_context> in systemPrompt
# Worker logs must show: "[SkillManager] Cache HIT for: plan-writing, architecture, task-management"
# (confirms prefetch worked — no D1 round-trip on first message)

# Skills dynamic pathway
# curl -X POST /agents/OrchestratorAgent/test-session \
#   -H "X-Agent-Skills: brainstorming,source-evaluation" \
#   -d '{"messages":[{"role":"user","content":"help me think"}]}'
# Worker logs must show: "[BaseChatAgent] Effective skills: architecture, task-management, brainstorming, source-evaluation"
# (static + dynamic merged, deduplicated)

# Skills cache TTL
# Two messages in same session — second message must show "[SkillManager] Cache HIT" not D1 fetch

# Unknown skill name warning
# Pass X-Agent-Skills: nonexistent-skill
# Worker logs must show: "[SkillManager] Unknown skill names (not in D1): nonexistent-skill"
# Response continues normally (non-fatal)

# Skill validation in healthProbe
# curl /health | jq '.checks | map(select(.name == "agent:OrchestratorAgent"))'
# Must include "skills_configured:3" in capabilities

# VercelOptions skillContext bypass (Jules two-step)
# In Jules step 2, options.skillContext is passed directly — no D1 call
# Worker logs must NOT show "[SkillManager] D1 fetch" during step 2
```
