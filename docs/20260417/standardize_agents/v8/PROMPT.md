# v8 PROMPT — Adopt new Cloudflare Agents SDK features (additively)

Read these first, in this order:

- [`docs/20260417/standardize_agents/v8/PRD.md`](./PRD.md) — per-feature decisions, architecture changes, risks, non-goals, verification block
- [`docs/20260417/standardize_agents/v8/TASKS.json`](./TASKS.json) — ordered execution plan with file paths and acceptance criteria
- [`docs/new_agents_sdk/think.md`](../../../new_agents_sdk/think.md) — Think class, lifecycle hooks, sub-agent RPC
- [`docs/new_agents_sdk/browse_web.md`](../../../new_agents_sdk/browse_web.md) — `createBrowserTools`, CDP usage
- [`docs/new_agents_sdk/observability.md`](../../../new_agents_sdk/observability.md) — diagnostics channels and `subscribe()` API
- [`docs/new_agents_sdk/codemode.md`](../../../new_agents_sdk/codemode.md) — `createCodeTool`, `DynamicWorkerExecutor`, sandbox isolation
- [`docs/20260417/standardize_agents/v7/PRD.md`](../v7/PRD.md) — **non-negotiable specialist-delegation invariants** still in force

---

## Mission

Absorb the new Cloudflare Agents SDK features **additively**. Pin the `agents` package, register observability subscribers, introduce a `BaseThinkAgent` shim alongside (not replacing) `BaseChatAgent`, migrate **only** `WorkshopAgent` to Think as a proof-of-concept, layer browser tools onto `CloudflareAgent` and `ResearchAgent` (without touching the existing Browser Render JSON-schema extraction), and scaffold codemode behind a feature flag with a single experimental call site in `EngineerAgent`.

By the end of this PR:

1. **`agents` package is pinned** (no more `"latest"`); `AGENTS_PACKAGE_AUDIT.md` documents the chosen version and breaking-change diff.
2. **Observability subscribers** forward at least five diagnostic channels into `Logger.persist()` and a process-scope ring buffer; the Tail Worker is configured in `wrangler.jsonc`.
3. **`BaseThinkAgent`** exists as a peer to `BaseChatAgent`, mirrors its service surface, and sets `chatRecovery: false`.
4. **`WorkshopAgent`** extends `BaseThinkAgent` (no longer `BaseChatAgent`); every existing `@callable` signature is preserved.
5. **`createBrowserToolsForAgent(env)`** wrapper exists; `CloudflareAgent` registers them when `BROWSER_TOOLS_ENABLED='1'`; `ResearchAgent` exposes a new `interactiveScrape({url, instruction})` `@callable`.
6. **`createCodeTool` wrapper** is fail-closed; only `EngineerAgent` has a single, gated, read-only call site (`experimentalCodemodeOrchestrate`); `CODEMODE_ENABLED` defaults off.
7. **Health framework** surfaces `recentRpcErrors` and `recentMcpEvents` from the observability ring buffer.
8. **Verification harness** `scripts/verify-v8.sh` runs the full grep + typecheck + dry-run suite and exits 0.

Work `TASKS.json` in dependency order. Parallel-safe groups are `[bracketed]` in `execution_order`.

Run `npx tsc --noEmit` after each task. If it fails, **stop and surface the error** rather than patching forward.

---

## Non-Negotiable Rules

These extend (not replace) v7's rules. v7 invariants 1–9 are still in force.

1. **MCP ownership stays with `chat/CloudflareAgent`.** (v7) Browser tools, codemode, observability subscribers, and the metrics-tap **must not** import `@/ai/mcp/mcp-client` from any other location.

2. **Octokit ownership stays with `backend/GithubAgent`.** (v7) The codemode tool filter must reject any tool whose registry entry has `writesToGitHub: true`. The browser tools wrapper must not import `@octokit/*`.

3. **`@callable` signatures are append-only.** (v7) Every Think migration and every new method (`interactiveScrape`, `experimentalCodemodeOrchestrate`) must add new `@callable` methods, never change existing signatures.

4. **Coexistence over big-bang.** `BaseChatAgent` and `BaseThinkAgent` both ship in v8. Only `WorkshopAgent` migrates. `CoordinatorAgent` and `CloudflareAgent` stay on `BaseChatAgent` until a future PR resolves the assistant-ui wire-shape audit.

5. **Codemode is gated.** `CODEMODE_ENABLED` defaults to `'0'`. Tools with `needsApproval: true`, GitHub writes, or Cloudflare mutations **must never** reach `createCodeTool`. The wrapper must **fail closed** (throw, not silently filter) if any such tool is passed in. The single call site (`experimentalCodemodeOrchestrate`) returns `{ status: 'disabled' }` when the flag is unset — it must never throw on the off-path.

6. **Browser Render is preserved.** The existing JSON-schema scraping in `ResearchAgent/methods/{github.ts, web-search.ts}` is **not** replaced. `browser_execute` is a new sibling capability for unstructured exploration via `methods/browser-execute.ts`. Diff on `github.ts` and `web-search.ts` must be empty in this PR.

7. **Observability is additive, not a Logger replacement.** Subscribers forward to `Logger.persist()`; do not remove or short-circuit `Logger` writes. Tail Worker integration is for real-time fan-out; D1 logging is for persisted history. Both are warranted.

8. **`agents` is pinned.** Do not reintroduce `"latest"` in `package.json`. The verification harness greps for it.

9. **Health framework stays.** The three-layer health checks remain authoritative. The new `metrics-tap.ts` (V8-11) augments — it does not replace — the existing report surface. Fields it adds are optional.

10. **Per-task verification.** Each task's `success_criteria` in `TASKS.json` names a typecheck + grep invocation. Run them and paste the output into the task's commit body before closing the task.

---

## Implementation Checkpoints

These are explicit pause-and-confirm gates, not just suggestions.

- **After V8-01 (pin agents) and before V8-02/V8-04/V8-06/V8-09:** Confirm the chosen `agents` version in `AGENTS_PACKAGE_AUDIT.md` actually exposes `Think`, `agents/browser/ai`, `agents/observability`, and `@cloudflare/codemode/ai`. If any is missing, stop and reconsider the version pin before scaffolding against APIs that don't exist.

- **After V8-04 (BaseThinkAgent shim) and before V8-05 (WorkshopAgent migration):** Manually verify that Think's `chatRecovery: false` setting interacts cleanly with `HitlQueue.pause()`. Stage a test that pauses a turn via HITL and confirms the agent does not double-pause via fiber recovery. If misbehavior is observed, file a follow-up and **keep WorkshopAgent on `BaseChatAgent`** for v8 — V8-05 becomes a v9 task.

- **After V8-07 (CloudflareAgent browser wiring):** Re-run the v7 specialist-delegation grep suite. **Zero hits required.** If any browser-tool import path drifts into the wrong agent, revert and rescope.

- **After V8-09 (codemode wrapper):** Manually call the wrapper with a `needsApproval: true` mock tool. The wrapper must throw, not silently filter. Repeat with `writesToGitHub: true` and `mutatesCloudflare: true`. All three must throw.

- **Before V8-12 sign-off:** PRD §Open Questions must be resolved — chosen `agents` version, Tail Worker name, browser rate limit, codemode tool list. Update PRD inline; do not ship with unresolved questions.

---

## Out of Scope

If the implementation pulls toward any of these, **stop**:

- Migrating `CoordinatorAgent` or `CloudflareAgent` to Think.
- Replacing the custom `CollaborationService` (WebSocket UI rooms) with Think `subAgent` (RPC dispatch). They solve different problems.
- Frontend message-shape changes (assistant-ui wire format).
- Removing `BaseChatAgent`, the custom `Logger`, or the three-layer health framework.
- Replacing `BrowserRenderApi.getJson()` with `browser_execute`.
- Adding new agents.
- Modifying any `@callable` signature on existing methods.
- Wrangler migrations beyond the four bindings listed in PRD §Architecture changes (`BROWSER`, `LOADER`, `tail_consumers`).

If something in `TASKS.json` seems to require any of the above, surface the conflict before proceeding.

---

## Critical Implementation Details

### V8-01 — Pin `agents` package

`package.json` currently has `"agents": "latest"`. Replace with a pinned semver. Recommendation: pin to the latest stable that exposes the features documented in `docs/new_agents_sdk/`. Run `npm install`, commit the lockfile delta, and document the version in `docs/20260417/standardize_agents/v8/AGENTS_PACKAGE_AUDIT.md` with sections:

```
# AGENTS_PACKAGE_AUDIT (v8)

## Pinned version
agents@<SEMVER>  (was "latest")

## Capabilities verified
- [x] Think (`@cloudflare/think` interop or in-package equivalent)
- [x] Browser tools (`agents/browser/ai`, `createBrowserTools`)
- [x] Observability (`agents/observability`, `subscribe`)
- [x] Codemode (`@cloudflare/codemode/ai`, `createCodeTool`)
- [x] Sub-agent RPC via Think.subAgent / chat callbacks

## Breaking-change diff vs. previous behavior
<paste relevant changelog excerpts>

## Smoke evidence (post V8-03)
<paste Tail Worker capture from a real wrangler dev round-trip>
```

Add a CI grep step (or `.agent/rules/no-latest-agents.md`) failing if `"latest"` reappears.

---

### V8-02 — Observability subscribers

```typescript
// src/backend/src/ai/observability/index.ts
import { subscribe } from 'agents/observability';
import { Logger } from '@/lib/logger';
import { ringBuffer } from './subscribers';

let registered = false;

export function registerObservability(env: Env) {
  if (registered) return;
  registered = true;

  subscribe('rpc', (event) => { ringBuffer.push(event); Logger.persist(env, { ...event, channel: 'rpc' }); });
  subscribe('rpc:error', (event) => { ringBuffer.push(event); Logger.persist(env, { ...event, channel: 'rpc:error', level: 'error' }); });
  subscribe('state:update', (event) => { Logger.persist(env, { ...event, channel: 'state' }); });
  subscribe('lifecycle', (event) => { Logger.persist(env, { ...event, channel: 'lifecycle' }); });
  subscribe('mcp:client:connect', (event) => { ringBuffer.push(event); Logger.persist(env, { ...event, channel: 'mcp' }); });
  subscribe('mcp:client:error', (event) => { ringBuffer.push(event); Logger.persist(env, { ...event, channel: 'mcp', level: 'error' }); });
  subscribe('schedule:execute', (event) => { Logger.persist(env, { ...event, channel: 'schedule' }); });
  subscribe('schedule:error', (event) => { Logger.persist(env, { ...event, channel: 'schedule', level: 'error' }); });
}
```

Module-scope `registered` guard prevents subscriber leaks across DO restarts. Call `registerObservability(env)` from `src/backend/src/index.ts` at boot. The `ringBuffer` (capacity 200, FIFO) is consumed by V8-11.

---

### V8-04 — `BaseThinkAgent` shim

Skeleton — reuse the service-injection patterns from `base-chat-agent.ts`:

```typescript
// src/backend/src/ai/providers/agent-support/base-think-agent.ts
import { Think } from 'agents';
import type { Logger } from '@/lib/logger';
import type { AIProvider } from '@/ai/providers';
import type { StateStore } from './state-store';
import type { HitlQueue } from './hitl-queue';
import type { SkillManager } from './skills';

export abstract class BaseThinkAgent<Env, State> extends Think<Env, State> {
  protected chatRecovery = false;       // intentional: see PRD §Risks
  protected logger!: Logger;
  protected stateStore!: StateStore;
  protected hitl!: HitlQueue;
  protected ai!: AIProvider;
  protected skillManager!: SkillManager;

  abstract readonly agentName: string;
  abstract readonly skills: string[];
  abstract agentInit(): Promise<void>;

  // Public accessors mirror BaseChatAgent (commit 8bdbdd7)
  getEnv() { return this.env; }
  getAI() { return this.ai; }
  getLogger() { return this.logger; }
  getStateStore() { return this.stateStore; }
  getSkills() { return this.skills; }
  getAgentName() { return this.agentName; }

  override async configureSession(session: Session) {
    const effective = await this.skillManager.resolveEffective(this.skills, /* dynamic */ []);
    const skillBlocks = await this.skillManager.toContextBlocks(effective);
    return session.withContextBlocks(skillBlocks);
  }

  override getSystemPrompt() {
    return `You are ${this.agentName}.`;   // skill content lives in context blocks
  }

  // streamEvents / receivePeerEvent @callable mirror BaseChatAgent — copy verbatim
  // agentHealthChecks(mode) override point — same signature as BaseAgent / BaseChatAgent
}
```

Do **not** modify `base-chat-agent.ts`. Export `BaseThinkAgent` from `agent-support/index.ts`.

---

### V8-05 — `WorkshopAgent` migration

```typescript
// src/backend/src/ai/agents/chat/WorkshopAgent/index.ts
/**
 * WorkshopAgent — v8 Think pilot.
 *
 * - Extends BaseThinkAgent (was BaseChatAgent in v7).
 * - chatRecovery: false (pending HITL × fiber characterization — see v8 PRD §Risks).
 * - @callable surface is APPEND-ONLY. Do not change existing signatures.
 */
import { BaseThinkAgent } from '@/ai/providers/agent-support';
import { callable } from 'agents';

export class WorkshopAgent extends BaseThinkAgent<Env, WorkshopAgentState> {
  readonly agentName = 'WorkshopAgent';
  readonly skills = [/* unchanged from v7 */];
  // … existing @callable methods preserved verbatim
}
```

Drop the custom `onChatMessage` override; rely on Think defaults. Move skill assembly into `configureSession()` (preferred) or `getSystemPrompt()`. Do not introduce branching UI features in this PR.

Smoke test in `wrangler dev`: open a chat, send one message, confirm response. Then call any one existing `@callable` (e.g. `chat()`, `orchestrateTasks()`) and confirm the response shape is unchanged.

---

### V8-06 — Browser tools wrapper

```typescript
// src/backend/src/ai/tools/browser-tools.ts
import { createBrowserTools } from 'agents/browser/ai';

export function createBrowserToolsForAgent(env: Env) {
  if (!env.BROWSER || !env.LOADER) {
    throw new Error('Browser tools require BROWSER and LOADER bindings');
  }
  const limit = Number(env.BROWSER_TOOLS_RATE_LIMIT ?? 10);
  // … per-call rate-limit + Logger.persist usage logging
  return createBrowserTools({
    browser: env.BROWSER,
    loader: env.LOADER,
    timeout: 30000,
  });
}
```

Add to `wrangler.jsonc`:

```jsonc
{
  "browser": { "binding": "BROWSER" },
  "unsafe": { "bindings": [{ "name": "LOADER", "type": "worker_loader" }] }
}
```

Confirm binding shape against the SDK docs at the chosen pinned version — wrangler binding syntax may differ.

---

### V8-07 — `CloudflareAgent` browser wiring

Wire only; no new methods, no signature changes. Inside `CloudflareAgent.getTools()`:

```typescript
const tools = { ...this.existingTools };
if (this.env.BROWSER_TOOLS_ENABLED === '1') {
  Object.assign(tools, createBrowserToolsForAgent(this.env));
}
return tools;
```

**Specialist invariant:** only `CloudflareAgent` registers browser tools in the chat tier. Do not wire to `CoordinatorAgent` or `WorkshopAgent`.

---

### V8-08 — `ResearchAgent.interactiveScrape`

```typescript
// src/backend/src/ai/agents/backend/ResearchAgent/methods/browser-execute.ts
/**
 * Use BrowserRenderApi.getJson for structured extraction.
 * Use this for unstructured exploration only.
 */
export async function interactiveScrapeImpl(
  agent: ResearchAgent,
  args: { url: string; instruction: string; perCallTimeoutMs?: number },
) {
  const { browser_execute } = createBrowserToolsForAgent(agent.getEnv());
  // … invoke with combined `url` + `instruction` prompt; capture output
  return { summary, rawJsLog };
}
```

Add to `ResearchAgent/index.ts` as a new `@callable`:

```typescript
@callable()
async interactiveScrape(args: { url: string; instruction: string; perCallTimeoutMs?: number }) {
  const { interactiveScrapeImpl } = await import('./methods/browser-execute');
  return interactiveScrapeImpl(this, args);
}
```

**Diff on `methods/github.ts` and `methods/web-search.ts` must be empty.**

---

### V8-09 — Codemode wrapper

```typescript
// src/backend/src/ai/tools/codemode-tool.ts
import { createCodeTool, DynamicWorkerExecutor } from '@cloudflare/codemode/ai';
import { filterToolsForCodemode } from '@/ai/mcp/registry-codemode-filter';

export function createGatedCodeTool(env: Env, tools: ToolSet) {
  if (env.CODEMODE_ENABLED !== '1') {
    throw new Error('Codemode is disabled (set CODEMODE_ENABLED=1)');
  }
  const safe = filterToolsForCodemode(tools);   // throws on unsafe entry
  return createCodeTool({
    tools: safe,
    executor: new DynamicWorkerExecutor({
      loader: env.LOADER,
      timeout: 30000,
      globalOutbound: null,
    }),
  });
}
```

```typescript
// src/backend/src/ai/mcp/registry-codemode-filter.ts
export function filterToolsForCodemode(tools: ToolSet): ToolSet {
  const safe: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const meta = registry[name];
    if (!meta) throw new Error(`Codemode: tool ${name} not in registry`);
    if (meta.needsApproval) throw new Error(`Codemode: ${name} requires approval`);
    if (meta.writesToGitHub) throw new Error(`Codemode: ${name} writes to GitHub`);
    if (meta.mutatesCloudflare) throw new Error(`Codemode: ${name} mutates Cloudflare`);
    safe[name] = tool;
  }
  return safe;
}
```

Augment `src/backend/src/ai/mcp/tools.ts` so every entry has the `needsApproval`, `writesToGitHub`, `mutatesCloudflare` flags (defaults `false`). Do not silently filter — fail closed.

---

### V8-10 — `EngineerAgent.experimentalCodemodeOrchestrate`

```typescript
// src/backend/src/ai/agents/backend/EngineerAgent/methods/experimental-codemode.ts
/**
 * BETA — gated on CODEMODE_ENABLED='1'.
 * Read-only tool subset only. See v8 PRD §Risks.
 */
export async function experimentalCodemodeOrchestrateImpl(agent: EngineerAgent, args: any) {
  if (agent.getEnv().CODEMODE_ENABLED !== '1') {
    return { status: 'disabled', reason: 'CODEMODE_ENABLED flag is off' };
  }
  const readOnlyTools = pickReadOnlyTools(agent);   // grep, file-read, agenticSearch, etc.
  const codemode = createGatedCodeTool(agent.getEnv(), readOnlyTools);
  // … invoke codemode against args
}
```

Off-path returns `{ status: 'disabled' }` — must never throw. The PRD's resolved tool list lives in `AGENTS_PACKAGE_AUDIT.md` once V8-12 closes Open Questions.

---

### V8-11 — Metrics-tap into health

```typescript
// src/backend/src/ai/providers/agent-support/health/metrics-tap.ts
import { ringBuffer } from '@/ai/observability/subscribers';

export function captureRecentEvents() {
  const all = ringBuffer.peek();   // peek, do not drain
  return {
    recentRpcErrors: all.filter((e) => e.type === 'rpc:error').slice(-20),
    recentMcpEvents: all.filter((e) => e.type?.startsWith('mcp:')).slice(-20),
  };
}
```

`runner.ts`: after collecting Layer 2 / 3 checks, `Object.assign(report, captureRecentEvents())`. Update `types.ts` to add the optional fields. Existing health tests must still pass.

---

### V8-12 — `verify-v8.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

npx tsc --noEmit
test "$(rg -n '\"latest\"' package.json | wc -l)" -eq 0
test "$(rg -n 'from .@/ai/mcp/mcp-client' src/backend/src/ai/agents | grep -v 'chat/CloudflareAgent' | wc -l)" -eq 0
test "$(rg -n '@octokit|getOctokit|new Octokit' src/backend/src/ai/agents | grep -v 'backend/GithubAgent' | wc -l)" -eq 0
test "$(rg -n 'rewriteQuestionForMCP' src/backend/src/ai/agents | grep -v 'chat/CloudflareAgent' | wc -l)" -eq 0
test "$(rg -n 'createCodeTool\(' src/backend/src | grep -v 'tools/codemode-tool.ts' | wc -l)" -eq 0
test "$(rg -n 'createBrowserTools\(' src/backend/src | grep -v 'tools/browser-tools.ts' | wc -l)" -eq 0
test "$(rg -n 'subscribe\(' src/backend/src/ai/observability | wc -l)" -ge 5
test "$(rg -n 'BaseThinkAgent' src/backend/src/ai/agents/chat/WorkshopAgent | wc -l)" -ge 1
test "$(rg -n 'extends BaseChatAgent' src/backend/src/ai/agents/chat/WorkshopAgent | wc -l)" -eq 0
test "$(rg -n '@callable' src/backend/src/ai/agents/backend/ResearchAgent | grep interactiveScrape | wc -l)" -eq 1
test "$(rg -n '@callable' src/backend/src/ai/agents/backend/EngineerAgent | grep experimentalCodemodeOrchestrate | wc -l)" -eq 1
npx wrangler deploy --dry-run

echo "v8 verification passed"
```

---

## Key Files Reference

| File | Action |
|------|--------|
| `package.json`, `package-lock.json` | pin `agents` (V8-01) |
| `docs/20260417/standardize_agents/v8/AGENTS_PACKAGE_AUDIT.md` | **new** (V8-01 + V8-12) |
| `src/backend/src/ai/observability/{index.ts,subscribers.ts}` | **new** (V8-02) |
| `src/backend/src/index.ts` | call `registerObservability(env)` at boot (V8-02) |
| `wrangler.jsonc` | add `BROWSER`, `LOADER`, `tail_consumers` (V8-03, V8-06) |
| `src/backend/src/ai/providers/agent-support/base-think-agent.ts` | **new** (V8-04) |
| `src/backend/src/ai/providers/agent-support/index.ts` | export `BaseThinkAgent` (V8-04) |
| `src/backend/src/ai/agents/chat/WorkshopAgent/{index.ts,health.ts,types.ts,methods/*}` | migrate to `BaseThinkAgent` (V8-05) |
| `src/backend/src/ai/tools/browser-tools.ts` | **new** (V8-06) |
| `src/backend/src/ai/agents/chat/CloudflareAgent/index.ts` | wire browser tools behind flag (V8-07) |
| `src/backend/src/ai/agents/backend/ResearchAgent/methods/browser-execute.ts` | **new** (V8-08) |
| `src/backend/src/ai/agents/backend/ResearchAgent/index.ts` | new `@callable interactiveScrape` (V8-08) |
| `src/backend/src/ai/tools/codemode-tool.ts` | **new** (V8-09) |
| `src/backend/src/ai/mcp/registry-codemode-filter.ts` | **new** (V8-09) |
| `src/backend/src/ai/mcp/tools.ts` | derive `safeForCodemode` flags (V8-09) |
| `src/backend/src/ai/agents/backend/EngineerAgent/methods/experimental-codemode.ts` | **new** (V8-10) |
| `src/backend/src/ai/agents/backend/EngineerAgent/index.ts` | new `@callable experimentalCodemodeOrchestrate` (V8-10) |
| `src/backend/src/ai/providers/agent-support/health/metrics-tap.ts` | **new** (V8-11) |
| `src/backend/src/ai/providers/agent-support/health/{runner.ts,types.ts}` | merge metrics-tap output (V8-11) |
| `scripts/verify-v8.sh` | **new** (V8-12) |
| `src/backend/src/ai/providers/agent-support/base-chat-agent.ts` | **unchanged** (do not modify) |
| `src/backend/src/lib/logger.ts` | **unchanged** (bridge target only) |
| `src/backend/src/ai/agents/backend/ResearchAgent/methods/{github.ts,web-search.ts}` | **unchanged** (Browser Render preserved) |

---

## Execution Discipline

- One commit per task (V8-01, V8-02, …). One task per commit makes review trivial.
- Do not batch unrelated edits.
- Do not reformat files you're not changing — diffs should show only the surgical change.
- After each commit, run the success_criteria slice for that task and paste the output into the commit body.
- If a fix requires touching a file not listed in **Key Files Reference**, **stop and ask** — it suggests the PRD or audit missed something.
- The full `scripts/verify-v8.sh` suite must pass before the merge commit.

---

## When in Doubt

- **Is this a Think behavior change?** Read `docs/new_agents_sdk/think.md` first.
- **Is this an `@callable` signature change?** Stop. Append-only.
- **Does this touch `BaseChatAgent` or the custom `Logger`?** Stop. They are not touched in v8.
- **Does this remove a Browser Render code path?** Stop. Browser Render is preserved.
- **Does the codemode wrapper need to silently filter rather than throw?** No. Fail closed, always.
- **Should `CoordinatorAgent` migrate to Think now?** No. v8 ships only the WorkshopAgent pilot.
