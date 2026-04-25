# v7 — Agent Collaboration Audit Findings

**Date:** 2026-04-23
**Scope:** Every Durable Object agent under `src/backend/src/ai/agents/` after the recent `chat/` vs `backend/` reorganization.
**Method:** Static analysis via `rg` and direct file reads. No runtime instrumentation.
**Motivating concern (from stakeholder):** Specialist agents (CloudflareAgent for Cloudflare docs/API, GithubAgent for GitHub) should be the single source of truth for their domain, consulted via `@callable` RPC. In practice, several agents still bypass specialists and call external services directly.

---

## 1. Agent Taxonomy After Refactor

`src/backend/src/ai/agents/` is now split by base class. The split cleanly enforces "frontend-facing" vs "pure RPC specialist" and is the foundation for every rule below.

| Tier | Base class | Agents | Role |
|------|-----------|--------|------|
| `chat/` | `BaseChatAgent` | **CoordinatorAgent** (new), CloudflareAgent, WorkshopAgent | Frontend-facing; stream to assistant-ui; `onChatMessage()` entry point |
| `backend/` | `BaseAgent` | OrchestratorAgent, EngineerAgent, GuardrailAgent, ResearchAgent, GithubAgent, DesignAgent, LearningAgent, CollaborationAgent | Pure RPC; no WebSocket; invoked via `@callable` from other agents |

**CoordinatorAgent** ([`src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts`](../../../src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts)) is the new frontend triage broker — the generic entry point for assistant-ui chat. Its current implementation is a placeholder (`handleStream` routes to `ORCHESTRATOR_AGENT` only), but its role is the linchpin of the collaboration architecture: users talk to CoordinatorAgent; CoordinatorAgent talks to backend specialists via `getPeerAgent<T>()`; no domain work runs inside CoordinatorAgent itself.

---

## 2. Agent Inventory (11 agents)

| Agent | Path | Base | Domain | External clients it may legitimately import |
|-------|------|------|--------|---------------------------------------------|
| CoordinatorAgent | `chat/CoordinatorAgent/` | `BaseChatAgent` | Frontend triage / router | *(none — routes to peers only)* |
| CloudflareAgent | `chat/CloudflareAgent/` | `BaseChatAgent` | Cloudflare SDK/API/Docs MCP | `@/ai/mcp/mcp-client`, `@/cloudflare/*` |
| WorkshopAgent | `chat/WorkshopAgent/` | `BaseChatAgent` | Project decomposition / wizard | *(none — consults CloudflareAgent, DesignAgent, EngineerAgent)* |
| OrchestratorAgent | `backend/OrchestratorAgent/` | `BaseAgent` | Task tree / sprint dispatch | *(none — consults EngineerAgent, CollaborationAgent, CloudflareAgent)* |
| EngineerAgent | `backend/EngineerAgent/` | `BaseAgent` | SWE fleet dispatch / Jules | Jules SDK, Stitch SDK |
| GuardrailAgent | `backend/GuardrailAgent/` | `BaseAgent` | L4 golden-path enforcement | *(none — consults CloudflareAgent)* |
| ResearchAgent | `backend/ResearchAgent/` | `BaseAgent` | Multi-source research | Browser Render, Discord API |
| GithubAgent | `backend/GithubAgent/` | `BaseAgent` | GitHub API / webhooks / PR review | `@octokit/*`, `@services/github/client`, Jules |
| DesignAgent | `backend/DesignAgent/` | `BaseAgent` | Stitch UI design pipeline | Stitch SDK |
| LearningAgent | `backend/LearningAgent/` | `BaseAgent` | HITL / health diagnosis | *(none — consults GithubAgent, CloudflareAgent, EngineerAgent)* |
| CollaborationAgent | `backend/CollaborationAgent/` | `BaseAgent` | Room / WebSocket message bus | *(none — persists to D1 only)* |

---

## 3. Bypass Inventory (the defects)

Each row is reproducible. Run the `grep` command in the repo root.

| # | File | Line | Bypass | Should be | Reproducer |
|---|------|------|--------|-----------|------------|
| 1 | `backend/GuardrailAgent/methods/cloudflare-docs.ts` | 99 | `agent.getAI().rewriteQuestionForMCP(...)` called locally; result fed to `cloudflareAgent.agenticSearch()` — **double-rewrite** | Pass the raw `mcpQuestionBase` to `agenticSearch`; CloudflareAgent rewrites internally | `rg "rewriteQuestionForMCP" src/backend/src/ai/agents/backend/GuardrailAgent` |
| 2 | `backend/LearningAgent/methods/diagnose-health.ts` | 55 | `deps.ai.rewriteQuestionForMCP(...)` called locally — **double-rewrite** | Pass raw `mcpQuery` to `cloudflareAgent.agenticSearch()` | `rg "rewriteQuestionForMCP" src/backend/src/ai/agents/backend/LearningAgent` |
| 3 | `backend/OrchestratorAgent/methods/reverse-engineering.ts` | 18, 113 | `import { queryMCP } from '@/ai/mcp/mcp-client'` + direct `queryMCP(env, ...)` call | `this.getPeerAgent<any>(this.env.CLOUDFLARE_AGENT).agenticSearch(...)` | `rg "queryMCP" src/backend/src/ai/agents/backend/OrchestratorAgent` |
| 4 | `backend/ResearchAgent/methods/github.ts` | 13–14 | `const { getOctokit } = await import("@services/octokit/core"); const octokit = await getOctokit(env); octokit.search.repos(...)` | Call a new `GithubAgent.searchRepositories()` `@callable` via `getPeerAgent` | `rg "getOctokit\|@octokit" src/backend/src/ai/agents/backend/ResearchAgent` |
| 5 | `services/planning/babysitter/utils.ts` | 47 | Non-agent utility calls `queryMCP` directly | Lower priority. Either thread via CloudflareAgent RPC or explicitly document as the *one* allowed non-agent call site | `rg "queryMCP" src/backend/src/services` |

**Verification that the audit is complete:** after the fixes land, the only agent paths that should match `rg "queryMCP\|rewriteQuestionForMCP" src/backend/src/ai/agents/` are `chat/CloudflareAgent/` (the sanctioned owner), and the only agent paths that should match `rg "@octokit\|getOctokit\|new Octokit" src/backend/src/ai/agents/` are `backend/GithubAgent/`.

---

## 4. Duplication Inventory

### 4.1 `rewriteQuestionForMCP` — 3 call sites (should be 1)

```
src/backend/src/ai/agents/chat/CloudflareAgent/index.ts:162           ← sanctioned (owner)
src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts:99   ← bypass #1
src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts:55     ← bypass #2
```

Behavior: `rewriteQuestionForMCP` takes a raw user-ish question and reforms it into a doc-search-optimal query. It is MCP-search plumbing; it belongs entirely inside `CloudflareAgent.agenticSearch()`. The two bypasses call it *before* `agenticSearch`, which re-runs the rewrite — wasting an AI call per invocation.

### 4.2 `queryMCP` — 4 call sites (should be 1 inside agents tree)

```
src/backend/src/ai/agents/chat/CloudflareAgent/index.ts:166,169                        ← sanctioned (owner)
src/backend/src/ai/agents/backend/OrchestratorAgent/methods/reverse-engineering.ts:18,113  ← bypass #3
src/backend/src/services/planning/babysitter/utils.ts:1,47                             ← non-agent utility (decide per C7)
src/backend/src/ai/mcp/mcp-client.ts:7                                                  ← the definition itself
```

### 4.3 Octokit initialization — 1 illegitimate bypass

```
src/backend/src/ai/agents/backend/GithubAgent/methods/shared.ts:1,19,30,44,87   ← sanctioned (internal to GithubAgent)
src/backend/src/ai/agents/backend/ResearchAgent/methods/github.ts:13–14          ← bypass #4
src/backend/src/services/github/client.ts, src/backend/src/services/octokit/*   ← shared helper (owner side)
```

---

## 5. Correct-Pattern Exemplars

These are the templates that v7's fixes should match.

### 5.1 `getPeerAgent` → specialist `@callable` (CF docs)

**File:** [`src/backend/src/ai/agents/backend/GuardrailAgent/methods/standardization.ts`](../../../src/backend/src/ai/agents/backend/GuardrailAgent/methods/standardization.ts) lines 57–59

```typescript
const cloudflareAgent = deps.agent.getPeerAgent((deps.env as any).CLOUDFLARE_AGENT);
const result = await cloudflareAgent.agenticSearch(String(args.query || ""));
```

No local rewrite. Raw question in; rewritten-and-queried result out. This is the target shape.

### 5.2 `getPeerAgent` → specialist `@callable` (GitHub)

**File:** [`src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts`](../../../src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts) lines 128, 154, 180

```typescript
const githubAgent = (deps.agent as any).getPeerAgent((deps.env as any).GITHUB_AGENT);
const prs = await githubAgent.checkDuplicatePR(repoOwner, repoName, "");
// ...
return await githubAgent.getFileContent(repoOwner, repoName, String(args.path || ""));
// ...
const prUrl = await githubAgent.createPullRequest({ owner, repo, branchName, filePath, newContent, commitMessage, prTitle, prBody });
```

Note: LearningAgent was previously the worst offender (the stakeholder's original complaint). It has already been refactored to delegate all GitHub ops to `GithubAgent`. Only the MCP rewrite (bypass #2) remains.

### 5.3 Frontend triage (CoordinatorAgent)

**File:** [`src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts`](../../../src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts) line 43

```typescript
const peer = this.getPeerAgent<any>(this.env.ORCHESTRATOR_AGENT);
```

Zero external SDK imports. Zero domain logic. Routes only. This is the floor for every `chat/` agent: if your chat agent needs to *do* something, route it; don't implement it.

---

## 6. Specialist Surface-Area Gaps

One missing `@callable` blocks C5. The rest of the bypasses can be fixed without adding API.

| Agent | Missing method | Needed by | Signature sketch |
|-------|----------------|-----------|------------------|
| GithubAgent | `searchRepositories(query, opts?)` | ResearchAgent/methods/github.ts | Returns array matching Octokit `search.repos` response `items`, optionally paginated |
| GithubAgent | `searchCode(query, opts?)` | (optional — ResearchAgent may need this for deep-reasoning use cases) | Returns array matching Octokit `search.code` response `items` |

CloudflareAgent already exposes `agenticSearch()` as `@callable` ([`chat/CloudflareAgent/index.ts:157-180`](../../../src/backend/src/ai/agents/chat/CloudflareAgent/index.ts)). No new surface needed there.

---

## 7. What's Already Done vs. What Remains

The stakeholder's original framing — "GuardrailAgent completely bypasses CloudflareAgent; LearningAgent is diagnosing directly" — was accurate at an earlier point in time. The refactor has already landed *partially*:

| Agent | GitHub delegation | CF docs delegation | Remaining issue |
|-------|-------------------|---------------------|------------------|
| GuardrailAgent | N/A | ✅ `standardization.ts` delegates; `cloudflare-docs.ts` delegates | **Double-rewrite** (#1) |
| LearningAgent | ✅ all three ops via GithubAgent | ✅ `agenticSearch` via peer | **Double-rewrite** (#2) |
| OrchestratorAgent | ✅ delegates to EngineerAgent | ❌ direct `queryMCP` in reverse-engineering | **Bypass** (#3) |
| ResearchAgent | ❌ direct Octokit | N/A | **Bypass** (#4) + specialist needs new `@callable` |
| CoordinatorAgent | N/A (routes only) | N/A (routes only) | Routing contract needs codification before features land |

---

## 8. Collaboration-Gap Summary (non-code)

Even after the five fixes above, two process gaps remain and are worth writing down:

1. **No lint/CI rule prevents regression.** A future contributor can `import { queryMCP }` in `backend/DesignAgent/` and no build fails. The `chat/` vs `backend/` split makes this trivially encodable as an ESLint `no-restricted-imports` rule scoped by path glob. (See PRD task C6.)

2. **The `@callable` surface of each specialist is not formally documented.** Consumers cast to `any` and invoke methods by string. Adding a minimal interface file per specialist (e.g. `backend/GithubAgent/rpc.ts` exporting the `@callable` signature as a TS interface) would give us compile-time discovery of new bypasses without boilerplate. (Out of scope for v7 — flagged for v8.)

---

## 9. Verification Commands

After v7 PRD/TASKS land, these commands must return zero matches outside the noted specialist directories:

```bash
# Only CloudflareAgent may import the MCP client
rg -n "from ['\"]@/ai/mcp/mcp-client" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent"
# (Expect: zero)

# Only GithubAgent may import Octokit/getOctokit
rg -n "@octokit|getOctokit|new Octokit" src/backend/src/ai/agents \
  | grep -v "backend/GithubAgent"
# (Expect: zero)

# Only CloudflareAgent may call rewriteQuestionForMCP
rg -n "rewriteQuestionForMCP" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent"
# (Expect: zero)

# CoordinatorAgent may not import any service/SDK
rg -n "from ['\"]@/cloudflare|@/ai/mcp|@octokit|@services/github|@services/octokit" \
  src/backend/src/ai/agents/chat/CoordinatorAgent
# (Expect: zero)
```
