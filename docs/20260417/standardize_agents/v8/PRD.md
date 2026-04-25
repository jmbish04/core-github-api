# v8 — Product Requirements Document

**Date:** 2026-04-25
**Parent plan:** `docs/20260417/standardize_agents/v5/PLAN.md` (foundational architecture still holds)
**Builds on:** `v7/PRD.md` (specialist-delegation invariants are non-negotiable in v8)
**Scope:** Adopt the new Cloudflare Agents SDK features documented in `docs/new_agents_sdk/*.md` (Think, Browser tools, Observability, Codemode, Subagents) **additively**, without disturbing v7 invariants and without big-bang base-class migrations.

---

## Context

After v7 closed the five remaining specialist-delegation bypasses, the agent layer is structurally clean: `CloudflareAgent` owns MCP, `GithubAgent` owns Octokit, `CoordinatorAgent` is a pure router, and `chat/` vs `backend/` provides a path-glob enforcement boundary. With that foundation set, four substantive new SDK capabilities (and a fifth Beta capability) warrant evaluation:

1. **Think** (`@cloudflare/think`) — opinionated chat framework extending `Agent`. Built-in agentic loop, message persistence, branching (non-destructive regeneration), streaming, lifecycle hooks (`beforeTurn` / `beforeToolCall` / `onStepFinish` / `onChatRecovery`), workspace tools (read/write/edit/list/find/grep over SQLite), `Session` with context blocks / compaction / FTS5 search, sub-agent RPC, durable execution via `chatRecovery: true`, and pluggable message-concurrency strategies (queue, latest, merge, drop, debounce). Source: `docs/new_agents_sdk/think.md`.
2. **Browser tools** (`agents/browser/ai`) — `createBrowserTools()` returns `browser_search` + `browser_execute`. The LLM writes JS that runs against the Chrome DevTools Protocol via a Browser Run binding. One session per call, no auth carryover, ~6k-token responses. Source: `docs/new_agents_sdk/browse_web.md`.
3. **Observability** (`agents/observability`) — `subscribe(channel, handler)` over Node diagnostics channels. Channels: `agents:rpc`, `:state`, `:message`, `:schedule`, `:lifecycle`, `:workflow`, `:mcp`, `:email`. Auto-forwards to Tail Workers. Zero overhead when no subscribers are attached. Source: `docs/new_agents_sdk/observability.md`.
4. **Codemode** (`@cloudflare/codemode/ai`) — `createCodeTool({tools, executor})`. The LLM writes JS that orchestrates multi-tool calls inside a `DynamicWorkerExecutor` sandbox. `globalOutbound: null` blocks egress by default. **Caveat:** `needsApproval` is not yet enforced inside the sandbox. Beta. Source: `docs/new_agents_sdk/codemode.md`.
5. **Subagents** — `Agent.subAgent(Class, name)` + `abortSubAgent()` + `deleteSubAgent()`. Children are **facets of the parent DO** with **isolated SQLite per child**, discovered automatically via `ctx.exports` (no separate DO bindings or migrations beyond declaring the child class as a `new_sqlite_classes` entry). Methods on the child become a **typed RPC stub** automatically — no `@callable` decorator needed. Streaming via `RpcTarget` callback. Limitations: `schedule()`, `cancelSchedule()`, `keepAlive()` are not supported inside sub-agents. **Crucially: `subAgent` is on the base `Agent` class, not Think-only**, so it works on `BaseAgent` subclasses today. Source: `docs/new_agents_sdk/subagents.md` and `docs/new_agents_sdk/think.md` (§Sub-agents — Think layers `chat()`-with-`StreamCallback` on top).

The repo today extends the SDK's `Agent` and `AIChatAgent` directly, with a custom service stack (`Logger`, `StateStore`, `SkillManager`, `HitlQueue`, `CollaborationService`, three-layer health framework) and a custom MCP tool registry (~50 tools). The `agents` package is pinned to `"latest"` — itself a v8 risk.

The intended outcome of v8 is to **absorb the SDK improvements without disturbing v7 invariants** and without a big-bang base-class migration that would risk frontend message-shape regressions in assistant-ui.

---

## Per-feature decisions

| Feature | Decision | Why |
|---|---|---|
| **Think** | Adopt later, behind shim, **per-agent migration** starting with `WorkshopAgent` | Different message model (tree vs flat) and different lifecycle hooks. `chatRecovery: true` default may double-pause with `HitlQueue.pause()`. `WorkshopAgent` has no branching UI dependency, making it the safest first migrant. `CoordinatorAgent` and `CloudflareAgent` stay on `BaseChatAgent` until the wire-shape audit lands. |
| **Browser tools** | Adopt now, scoped, behind flag | Layer onto `CloudflareAgent` (chat) + new `ResearchAgent.interactiveScrape()` `@callable`. Existing Browser Render API stays for structured JSON-schema extraction — these are **complementary** capabilities, not replacements. |
| **Observability** | Adopt now, additive | Zero-overhead subscribers in a new `src/backend/src/ai/observability/` module. Forward to existing `Logger.persist()` and a `health.metricsTap()` ring buffer. Tail Worker registered in `wrangler.jsonc`. The custom `Logger` keeps its persisted, secret-masked D1 history; SDK observability supplies real-time channel events. Both are warranted. |
| **Codemode** | Adopt later, behind `CODEMODE_ENABLED='0'` flag | Beta + missing `needsApproval` semantics is incompatible with HITL invariants. Scaffold a strict wrapper that hard-fails on approval-gated, GitHub-write, or Cloudflare-mutation tools. Single experimental call site in `EngineerAgent`. |
| **Subagents** | Adopt now, narrowly, as a parallel-work primitive — **distinct from `getPeerAgent`**, not a replacement | After reading `docs/new_agents_sdk/subagents.md`: subagents are **Agent-level** (work on `BaseAgent` today, no Think dependency) and create **isolated-SQLite child facets** of the parent DO. They are **not** the same primitive as `getPeerAgent` — peer dispatch routes between long-lived, globally-addressable specialist DOs (CloudflareAgent, GithubAgent); subagents are short-lived, parent-owned children with private storage that no other agent can reach. Use them for fan-out parallelism (e.g., N concurrent web queries each with isolated state) and tree-structured task delegation. **v7 specialist invariants are unaffected** — `getPeerAgent` remains the only sanctioned cross-specialist channel. v8 ships one POC: `ResearchAgent` spawns `WebQueryWorker` subagents for parallel queries (V8-13). |
| **Skills service** | Keep D1 as the source of truth — adopt the Think `SkillProvider` shape as an **adapter** over the existing `SkillManager` | After reviewing the Think `R2SkillProvider` example: the Think `Session.withContext("skills", { provider })` pattern is idiomatic and worth adopting, but **the storage backend should stay D1**. R2 is rejected (hard to update). Octokit-against-the-standardization-repo is intriguing for governance/PR-review of skill changes but adds latency, rate-limit risk, and couples `SkillManager` to `GithubAgent` via `getPeerAgent` indirection — out of scope for v8. Edigraph/D1/KV add complexity without solving a current problem. **v8 decision:** wrap the existing D1-backed `SkillManager` in a `SkillProvider` adapter that conforms to Think's interface, then plug it into `BaseThinkAgent.configureSession()`. Future (v9 candidate, not blocking): a scheduled worker that syncs the standardization repo into the D1 `agentSkills` table for git-versioned skill governance — runtime read path stays D1. |

---

## Architecture changes

- **New** `src/backend/src/ai/providers/agent-support/base-think-agent.ts` — mirrors `BaseChatAgent`'s service surface (logger, stateStore, hitl, peer events, health framework, skill resolution) but extends `Think<Env, State>`. `chatRecovery: false` initially. Provides `agentInit()` abstract, public accessors matching `BaseChatAgent` (commit `8bdbdd7`).
- **New** `src/backend/src/ai/observability/{index.ts, subscribers.ts}` — registers subscribers at boot, fans events out to `Logger.persist()` and the metrics-tap ring buffer.
- **New** `src/backend/src/ai/tools/browser-tools.ts` — `createBrowserToolsForAgent(env)` wrapper. Used only by `CloudflareAgent` (chat tier) and `ResearchAgent` (backend tier). Per-call rate limit + D1 logging.
- **New** `src/backend/src/ai/tools/codemode-tool.ts` + `src/backend/src/ai/mcp/registry-codemode-filter.ts` — strict wrapper that asserts `env.CODEMODE_ENABLED === '1'` and **hard-fails** if any passed tool has `needsApproval || writesToGitHub || mutatesCloudflare`.
- **New** `src/backend/src/ai/providers/agent-support/health/metrics-tap.ts` — surfaces recent `rpc:error` and `mcp` channel events into the existing health report (`recentRpcErrors`, `recentMcpEvents` fields).
- **Modified** `wrangler.jsonc` — adds `BROWSER` (Browser Run), `LOADER` (Worker Loader for codemode + browser execute), `tail_consumers` for the Tail Worker.
- **Modified** `package.json` — replaces `"agents": "latest"` with a pinned semver matching the SDK that ships these features. Adds CI grep guard against `"latest"`.
- **Migrated** `src/backend/src/ai/agents/chat/WorkshopAgent/*` — moves from `BaseChatAgent` to `BaseThinkAgent`. All existing `@callable` signatures preserved (append-only).
- **Augmented** `src/backend/src/ai/mcp/tools.ts` — every registry entry derives a `safeForCodemode: boolean` (= `!needsApproval && !writesToGitHub && !mutatesCloudflare`).
- **New** `src/backend/src/ai/providers/agent-support/skill-provider.ts` — Think-shaped `SkillProvider` adapter wrapping the existing D1-backed `SkillManager`. `BaseThinkAgent.configureSession()` plugs it into `Session.withContext("skills", { provider })`. **Storage stays D1.** No changes to `SkillManager`'s read path or D1 schema.
- **New** `src/backend/src/ai/agents/backend/ResearchAgent/methods/parallel-queries.ts` + a child class `WebQueryWorker` exported from the worker entry point. `ResearchAgent` exposes a single new `@callable executeParallelWebQueries({queries: string[]})` that fans out via `this.subAgent(WebQueryWorker, name)` — proves the subagent pattern in one surgical place. Wrangler `migrations` adds `WebQueryWorker` to `new_sqlite_classes`. **No new top-level DO binding** (subagents are facets of the parent).

---

## Reuse — existing utilities the implementation must use

| Utility | Path | How it is reused |
|---|---|---|
| `Logger.persist()` | `src/backend/src/lib/logger.ts` | All observability fan-out forwards here. Do not duplicate D1 writes. |
| `getPeerAgent<T>(env.X_AGENT)` | base classes | All non-Think dispatch (v7 sanctioned). |
| `SkillManager.resolveEffective()` | `src/backend/src/ai/providers/agent-support/skills.ts` | Inside `BaseThinkAgent.getSystemPrompt()` / `configureSession()`. |
| `HitlQueue` | `src/backend/src/ai/providers/agent-support/hitl-queue.ts` | Preserved as-is. `chatRecovery: false` avoids double-pause semantics. |
| `BrowserRenderApi.getJson()` | `src/backend/src/ai/mcp/tools/browser/` | Kept for structured JSON-schema extraction. `browser_execute` is for unstructured exploration only. |
| Three-layer health framework | `src/backend/src/ai/providers/agent-support/health/*` | Authoritative. Metrics-tap augments, never replaces. |
| `SkillManager` (D1-backed) | `src/backend/src/ai/providers/agent-support/skills.ts` | Storage source of truth. The new `SkillProvider` adapter (V8-04 sub-step) wraps it for Think `Session.withContext("skills", …)`. D1 schema (`agentSkills` via Drizzle) is not modified. |
| `getAgentByName` / `getPeerAgent` | base classes | Continues to be the **only** cross-specialist dispatch channel. Subagents (`this.subAgent`) are exclusively for parent-owned ephemeral children — never used to reach another specialist. |

---

## Risks

- **Think `chatRecovery` × `HitlQueue`** — durable-fiber turn wrapping may double-pause turns that HITL has already paused. Mitigation: `chatRecovery: false` on the first migrant; characterize HITL behavior under fibers before flipping.
- **Frontend wire-shape** — Think's tree-structured branching messages vs. assistant-ui's flat `cf_agent_chat_*` shape. Wire-protocol is compatible at the basic layer, but branching UI is not. Mitigation: `WorkshopAgent` first (no branching UI dependency); document audit before migrating Coordinator / Cloudflare.
- **Browser Run quota** — `browser_execute` opens a fresh CDP session per call. Costs rise quickly. Mitigation: rate-limit in the wrapper, log quota events to D1, gate behind `BROWSER_TOOLS_ENABLED`.
- **Codemode footgun** — `needsApproval` not enforced in sandbox. Mitigation: fail-closed wrapper, registry-derived `safeForCodemode`, no production call site, single experimental call site behind `CODEMODE_ENABLED='1'`.
- **Specialist invariants** (v7) — new tool surfaces (browser, codemode) could smuggle Octokit / MCP into the wrong agent. Mitigation: re-run v7 grep guards after every task; codemode filter rejects any tool whose registry entry has `mutatesCloudflare || writesToGitHub`.
- **Observability subscriber leaks** across agent restarts. Mitigation: module-scope idempotent registration; `unsubscribe` returned but not called (lifetime = process).
- **`agents@latest`** — silent breaking changes. Mitigation: V8-01 pins the version, adds CI grep guard, documents the changelog audit.
- **Subagent confusion with peer dispatch** — engineers may reach for `this.subAgent` to call another specialist (CloudflareAgent, GithubAgent), violating v7 invariants. Mitigation: new non-negotiable rule in PROMPT.md ("`subAgent` is for parent-owned ephemeral children only; cross-specialist dispatch stays on `getPeerAgent`"); ESLint or `.agent/rules` clarifies the split; the V8-13 POC names the child class `WebQueryWorker` (not `Researcher`) to make ephemerality obvious.
- **Subagent SQLite schema drift** — each `WebQueryWorker` instance has its own SQLite. Schema needs to be created idempotently inside the child's first method call (or `onStart`). Mitigation: V8-13 child uses `CREATE TABLE IF NOT EXISTS` patterns from the subagents.md examples; no migration system needed for ephemeral state.
- **Subagent limitations** — `schedule()`, `cancelSchedule()`, `keepAlive()` are not supported in subagents. Mitigation: the V8-13 POC does not use them; if a future subagent need scheduling, the parent schedules and delegates on fire.
- **Skill adapter ↔ D1 cache invalidation** — the `SkillProvider` adapter must not bypass `SkillManager`'s in-memory TTL cache. Mitigation: adapter is a thin pass-through; no new caching layer. D1 remains the single source of truth.

---

## Explicit Non-Goals

- No `CoordinatorAgent` or `CloudflareAgent` migration to Think in v8.
- No removal of `BaseChatAgent`. It coexists with `BaseThinkAgent`.
- No removal of the custom `Logger` or three-layer health framework. Observability is **additive**.
- No consolidation of `CollaborationService` (WebSocket UI rooms, D1-mirrored chat) with Think `subAgent` (RPC dispatch with streaming callbacks). They solve different problems.
- No replacement of the existing Browser Render JSON-schema extraction in `ResearchAgent/methods/{github.ts, web-search.ts}`.
- No frontend message-shape changes.
- No `@callable` signature changes on existing methods (append-only — carried over from v7).
- No new agents (top-level Durable Objects). The V8-13 `WebQueryWorker` is a **subagent class** — a facet of `ResearchAgent`, not a new top-level DO binding.
- No wrangler migration changes beyond the four bindings listed above plus the `WebQueryWorker` `new_sqlite_classes` entry for V8-13.
- No replacement of `SkillManager`'s D1 storage backend. The `SkillProvider` adapter is a presentation-layer wrapper; it does **not** introduce R2, Octokit-backed, edigraph, or KV storage for skills in v8. Source-of-truth migration to a GitHub-synced model is a v9 candidate.
- No use of `this.subAgent` to reach another specialist. Cross-specialist dispatch stays on `getPeerAgent` (v7).

---

## Open Questions

1. **`agents` pinned version (V8-01).** Which semver line ships `Think`, `agents/browser/ai`, `agents/observability`? The audit deliverable (`AGENTS_PACKAGE_AUDIT.md`) resolves this before any code change.
2. **Tail Worker target (V8-03).** New Tail Worker, or reuse an existing one? If new, name + script-name to register in `wrangler.jsonc`.
3. **`BaseThinkAgent` skill assembly (V8-04).** Use `configureSession()` to inject skill context blocks (idiomatic Think) or `getSystemPrompt()` string-concat (closer to current `BaseChatAgent` shape)? Recommend `configureSession()` because it survives compaction.
4. **`browser_execute` rate limit (V8-06).** What limit? Recommend 10 calls per agent per minute, configurable via env. Confirm before implementation.
5. **Codemode experimental tool list (V8-10).** Strictly read-only — exact list TBD. Recommend: `mcp__github__searchCode`, `mcp__github__searchRepositories`, codebase grep / file-read tools, MCP `agenticSearch`. Explicitly excluded: anything writing GitHub, mutating Cloudflare, or with `needsApproval`.
6. **`WebQueryWorker` storage shape (V8-13).** Recommend a single `query_log` table per child: `(id PK, query, started_at, finished_at, status, result_summary)`. Each subagent writes only to its own SQLite; aggregation happens in the parent via the RPC stub. Confirm before implementation.
7. **Skill source-of-truth migration (post-v8).** If/when the team wants the standardization repo to govern skills, the path is: scheduled worker pulls markdown from `${env.STANDARDIZATION_REPO}/skills/*.md` via `getPeerAgent(GITHUB_AGENT).getFileContent()` and upserts into the `agentSkills` D1 table. Runtime read path stays D1 via `SkillManager`. v9 candidate.

---

## Verification

After v8 lands, every one of the following must pass:

```bash
# 1. Type-check
npx tsc --noEmit

# 2. v7 specialist invariants still hold
rg -n "from ['\"]@/ai/mcp/mcp-client" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent" | wc -l   # must be 0
rg -n "@octokit|getOctokit|new Octokit" src/backend/src/ai/agents \
  | grep -v "backend/GithubAgent" | wc -l    # must be 0
rg -n "rewriteQuestionForMCP" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent" | wc -l   # must be 0

# 3. v8-specific guards
rg -n "\"latest\"" package.json | wc -l                              # must be 0
rg -n "createCodeTool\\(" src/backend/src \
  | grep -v "tools/codemode-tool.ts" | wc -l                         # must be 0
rg -n "createBrowserTools\\(" src/backend/src \
  | grep -v "tools/browser-tools.ts" | wc -l                         # must be 0
rg -n "subscribe\\(" src/backend/src/ai/observability | wc -l        # must be ≥ 5

# 4. WorkshopAgent migrated to BaseThinkAgent
rg -n "BaseThinkAgent" src/backend/src/ai/agents/chat/WorkshopAgent | wc -l   # must be ≥ 1
rg -n "extends BaseChatAgent" src/backend/src/ai/agents/chat/WorkshopAgent | wc -l   # must be 0

# 5. New @callable surface (append-only)
rg -n "@callable" src/backend/src/ai/agents/backend/ResearchAgent \
  | grep "interactiveScrape" | wc -l                                 # must be 1
rg -n "@callable" src/backend/src/ai/agents/backend/ResearchAgent \
  | grep "executeParallelWebQueries" | wc -l                         # must be 1
rg -n "@callable" src/backend/src/ai/agents/backend/EngineerAgent \
  | grep "experimentalCodemodeOrchestrate" | wc -l                   # must be 1

# 5a. Subagent POC (V8-13)
rg -n "this\\.subAgent\\(" src/backend/src/ai/agents \
  | wc -l                                                            # must be ≥ 1
rg -n "export class WebQueryWorker" src/backend/src \
  | wc -l                                                            # must be 1
rg -n "this\\.subAgent\\(" src/backend/src/ai/agents \
  | grep -E "CloudflareAgent|GithubAgent|CoordinatorAgent" | wc -l   # must be 0 (no specialist via subAgent)

# 5b. SkillProvider adapter
rg -n "class .*SkillProvider" src/backend/src/ai/providers/agent-support/skill-provider.ts \
  | wc -l                                                            # must be ≥ 1
rg -n "withContext\\(.skills." src/backend/src/ai/providers/agent-support/base-think-agent.ts \
  | wc -l                                                            # must be ≥ 1

# 6. Codemode flag-off path
CODEMODE_ENABLED=0 npx tsc --noEmit                                  # must pass
# Confirm experimentalCodemodeOrchestrate returns a "disabled" stub when flag is unset

# 7. Build
npx wrangler deploy --dry-run                                        # must succeed

# 8. Functional smoke (post-deploy)
# - WorkshopAgent chat round-trip via wrangler dev completes successfully
# - Tail Worker receives at least one agents:rpc event during the round-trip
# - CloudflareAgent.chat (BROWSER_TOOLS_ENABLED=1) can invoke browser_search
# - ResearchAgent.interactiveScrape({ url, instruction }) returns a non-empty result
```

The combined grep + typecheck suite is bundled in `scripts/verify-v8.sh` (delivered by V8-12).

---

## Critical Files Reference

| Area | Path | Action |
|---|---|---|
| Pin `agents` package | `package.json`, `package-lock.json` | modify (V8-01) |
| Package audit | `docs/20260417/standardize_agents/v8/AGENTS_PACKAGE_AUDIT.md` | new (V8-01) |
| Observability module | `src/backend/src/ai/observability/{index.ts,subscribers.ts}` | new (V8-02) |
| Wrangler bindings | `wrangler.jsonc` | modify — add `tail_consumers`, `BROWSER`, `LOADER` (V8-03, V8-06) |
| `BaseThinkAgent` shim | `src/backend/src/ai/providers/agent-support/base-think-agent.ts` | new (V8-04) |
| WorkshopAgent migration | `src/backend/src/ai/agents/chat/WorkshopAgent/{index.ts,health.ts,types.ts,methods/*}` | modify (V8-05) |
| Browser tools wrapper | `src/backend/src/ai/tools/browser-tools.ts` | new (V8-06) |
| CloudflareAgent browser tools wiring | `src/backend/src/ai/agents/chat/CloudflareAgent/index.ts` | modify (V8-07) |
| ResearchAgent interactive scrape | `src/backend/src/ai/agents/backend/ResearchAgent/methods/browser-execute.ts` (new) + `index.ts` | new + modify (V8-08) |
| Codemode wrapper | `src/backend/src/ai/tools/codemode-tool.ts`, `src/backend/src/ai/mcp/registry-codemode-filter.ts` | new (V8-09) |
| EngineerAgent codemode call site | `src/backend/src/ai/agents/backend/EngineerAgent/methods/experimental-codemode.ts` (new) + `index.ts` | new + modify (V8-10) |
| Health metrics-tap | `src/backend/src/ai/providers/agent-support/health/metrics-tap.ts` (new) + `runner.ts` (modify) | new + modify (V8-11) |
| Verification harness | `scripts/verify-v8.sh` | new (V8-12) |
| Subagents POC | `src/backend/src/ai/agents/backend/ResearchAgent/methods/parallel-queries.ts` (new), `index.ts` (modify), worker entry export (modify), `wrangler.jsonc` `migrations.new_sqlite_classes` (modify) | new + modify (V8-13) |
| SkillProvider adapter | `src/backend/src/ai/providers/agent-support/skill-provider.ts` (new), `base-think-agent.ts` (uses adapter in `configureSession`) | new (V8-04 sub-step) |
| Logger (bridge target, do not modify) | `src/backend/src/lib/logger.ts` | unchanged |
| BaseChatAgent (reference, do not modify) | `src/backend/src/ai/providers/agent-support/base-chat-agent.ts` | unchanged |

---

## Execution Order

```
V8-01 (pin agents + audit)
   ↓
[V8-02 (observability module), V8-04 (BaseThinkAgent shim), V8-06 (browser wrapper), V8-09 (codemode wrapper)]   # parallel; independent
   ↓
[V8-03 (Tail Worker binding) ← V8-02,
 V8-05 (WorkshopAgent migration) ← V8-04,
 V8-07 (CloudflareAgent browser wiring) ← V8-06,
 V8-08 (ResearchAgent interactive scrape) ← V8-06,
 V8-10 (EngineerAgent codemode call site) ← V8-09,
 V8-11 (metrics-tap → health) ← V8-02,
 V8-13 (subagent POC: ResearchAgent.executeParallelWebQueries via WebQueryWorker)]   # independent of all phase-2 tasks
   ↓
V8-12 (verify-v8.sh + final docs)
```

Each task ends with `npx tsc --noEmit` passing and a commit. Verification block is run end-to-end before merge.
