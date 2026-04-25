# v7 PROMPT — Close Agent Collaboration Gaps

Read these first:

- `docs/20260417/standardize_agents/v7/AUDIT_FINDINGS.md` — evidence for every change below
- `docs/20260417/standardize_agents/v7/PRD.md` — task scope, file paths, non-goals
- `docs/20260417/standardize_agents/v7/TASKS.json` — ordered execution plan

## Mission

Five remaining bypasses prevent CloudflareAgent and GithubAgent from being the true single source of truth for their domains. Your job is to eliminate all five and add a guardrail that prevents regression. By the end of this PR:

1. **No agent outside `chat/CloudflareAgent/` imports `@/ai/mcp/mcp-client` or calls `rewriteQuestionForMCP`.**
2. **No agent outside `backend/GithubAgent/` imports Octokit or `@services/octokit/*`.**
3. **GithubAgent exposes `searchRepositories` and `searchCode` as `@callable`,** consumed by ResearchAgent via `getPeerAgent`.
4. **CoordinatorAgent's pure-router contract is codified in code and lint.**
5. **A lint rule (or equivalent `.agent/rules/` enforcement) makes bypasses impossible to merge.**

Work through `TASKS.json` in dependency order. Parallel-safe groups are `[bracketed]` in the task graph.

---

## Non-Negotiable Rules

1. **MCP ownership is CloudflareAgent's.** No file under `src/backend/src/ai/agents/` except `chat/CloudflareAgent/` may `import … from '@/ai/mcp/mcp-client'`. The sanctioned consumer API is `cloudflareAgent.agenticSearch(rawQuestion, context?)` invoked via `getPeerAgent<T>(env.CLOUDFLARE_AGENT)`.

2. **Octokit ownership is GithubAgent's.** No file under `src/backend/src/ai/agents/` except `backend/GithubAgent/` may import `@octokit/*`, `@services/octokit/*`, or construct an `Octokit` instance. Other agents consume via `@callable` RPC.

3. **No double-rewrite.** Consumers of `agenticSearch` pass the **raw** question. `rewriteQuestionForMCP` is called *exactly once per request* — inside `CloudflareAgent.agenticSearch`. Calling it locally then passing the result to `agenticSearch` is a bug (CloudflareAgent rewrites again, wasting an AI call and potentially mangling the query).

4. **Use the `getPeerAgent` pattern as-written.** `this.getPeerAgent<T>(this.env.FOO_AGENT)` (or `(agent as any).getPeerAgent((env as any).FOO_AGENT)` in method files). Do not hand-roll `env.FOO_AGENT.getByName(...)` — the base class helper exists for a reason (handles session scoping + state-store warmup).

5. **Graceful degradation is mandatory.** Every peer-RPC call must be wrapped in try/catch with a sensible fallback. Reference pattern: [`backend/GuardrailAgent/methods/cloudflare-docs.ts:107-118`](../../../src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts). If the peer is unreachable, the calling agent must continue with static/local behavior — never propagate the peer failure as a hard exception.

6. **`@callable` signatures are append-only.** You may add new `@callable` methods (C4 does this). You may not change the signature of an existing `@callable`. If a method needs a new parameter, add an optional one.

7. **CoordinatorAgent is a pure router.** Its only permitted imports are `agents` (for `callable`, `getAgentByName`, `StreamingResponse`, `getPeerAgent` helpers), `@/ai/providers/agent-support/base-chat-agent`, and local `./types`. **Forbidden:** any `@octokit/*`, `@/ai/mcp/*`, `@/cloudflare/*`, `@services/*`, or third-party SDK. All domain work routes to a backend specialist. Enforce in C9.

8. **`chat/` vs `backend/` discipline.** New frontend chat agents go under `chat/` and extend `BaseChatAgent`. New pure-RPC specialists go under `backend/` and extend `BaseAgent`. Do not mix. The lint rule in C6 is expressed as path globs based on this split.

9. **Verification per task.** Each task's `success_criteria` names a grep or `tsc` invocation. Run it before closing the task.

---

## Critical Implementation Details

### C1 — GuardrailAgent: drop local rewrite

**File:** [`src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts`](../../../src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts)

**Before (lines ~83-118):**
```typescript
const mcpQuestionBase = `I need to verify that the following code files comply with our Cloudflare golden-path rules...`;

logger.info(`${loggerPrefix}MCP question base: ${mcpQuestionBase}`);
const mcpQuestion = await agent.getAI().rewriteQuestionForMCP(
  mcpQuestionBase,
  { files: payload.files.map((f) => f.path), rules: activeRules.map((r) => r.title) },
);
logger.info(`${loggerPrefix}MCP question: ${mcpQuestion}`);

let docsContext: string | null = null;
try {
  const cloudflareAgent = (agent as any).getPeerAgent((env as any).CLOUDFLARE_AGENT);
  const mcpResult = await cloudflareAgent.agenticSearch(mcpQuestion);
  // ...
} catch (err) { /* graceful degradation */ }
```

**After:**
```typescript
const mcpQuestionBase = `I need to verify that the following code files comply with our Cloudflare golden-path rules...`;

logger.info(`${loggerPrefix}MCP question base: ${mcpQuestionBase}`);

let docsContext: string | null = null;
try {
  const cloudflareAgent = (agent as any).getPeerAgent((env as any).CLOUDFLARE_AGENT);
  const mcpResult = await cloudflareAgent.agenticSearch(
    mcpQuestionBase,
    { files: payload.files.map((f) => f.path), rules: activeRules.map((r) => r.title) },
  );
  // ...
} catch (err) { /* graceful degradation */ }
```

Net: remove the local `rewriteQuestionForMCP` call (5 lines). Pass the raw base + context into `agenticSearch`. Keep the logger line that logs the base question.

---

### C2 — LearningAgent: drop local rewrite

**File:** [`src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts`](../../../src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts)

**Before (lines ~52-70):**
```typescript
const mcpQuery = `How to fix Cloudflare worker error: ${payload.errorName} - ${payload.errorMessage}`;
let rewritten = mcpQuery;
try {
  const rewrittenResult = await deps.ai.rewriteQuestionForMCP(mcpQuery);
  if (rewrittenResult) rewritten = rewrittenResult;
} catch {
  /* fallback to original */
}

let mcpContext = "No Cloudflare Docs context available.";
try {
  if (deps.agent) {
    const cloudflareAgent = (deps.agent as any).getPeerAgent((deps.env as any).CLOUDFLARE_AGENT);
    const mcpResult = await cloudflareAgent.agenticSearch(rewritten);
    mcpContext = typeof mcpResult === "string" ? mcpResult : JSON.stringify(mcpResult);
  }
} catch {
  /* fallback */
}
```

**After:**
```typescript
const mcpQuery = `How to fix Cloudflare worker error: ${payload.errorName} - ${payload.errorMessage}`;

let mcpContext = "No Cloudflare Docs context available.";
try {
  if (deps.agent) {
    const cloudflareAgent = (deps.agent as any).getPeerAgent((deps.env as any).CLOUDFLARE_AGENT);
    const mcpResult = await cloudflareAgent.agenticSearch(mcpQuery);
    mcpContext = typeof mcpResult === "string" ? mcpResult : JSON.stringify(mcpResult);
  }
} catch {
  /* fallback */
}
```

Net: delete the `let rewritten = mcpQuery;` block and the first try/catch. Pass `mcpQuery` directly to `agenticSearch`.

---

### C3 — OrchestratorAgent: delegate reverse-engineering MCP

**File:** [`src/backend/src/ai/agents/backend/OrchestratorAgent/methods/reverse-engineering.ts`](../../../src/backend/src/ai/agents/backend/OrchestratorAgent/methods/reverse-engineering.ts)

**Remove (line 18):**
```typescript
import { queryMCP } from '@/ai/mcp/mcp-client';
```

**Replace (line ~113) — before:**
```typescript
cloudflareDocs = await queryMCP(/* env, query, 'OrchestratorAgent' */);
```

**After:**
```typescript
try {
  const cloudflareAgent = (agent as any).getPeerAgent((env as any).CLOUDFLARE_AGENT);
  cloudflareDocs = await cloudflareAgent.agenticSearch(query);
} catch (err) {
  (agent as any).logger?.warn?.(`[ReverseEngineering] CloudflareAgent agenticSearch failed; continuing without docs context`, err);
  cloudflareDocs = null;
}
```

Adjust the exact parameter-passing to match the surrounding function's variable names. Preserve the existing graceful-degradation shape.

---

### C4 — GithubAgent: add `searchRepositories` and `searchCode` `@callable`

**New file:** `src/backend/src/ai/agents/backend/GithubAgent/methods/search.ts`

```typescript
import { getOctokitAsUser } from '@/services/github/client';
import type { GithubAgent } from '../index';

export interface SearchReposArgs {
  query: string;
  perPage?: number;
  page?: number;
}

export async function searchRepositoriesImpl(
  agent: GithubAgent,
  args: SearchReposArgs,
): Promise<any[]> {
  const env = (agent as any).env as Env;
  const octokit = await getOctokitAsUser(env);
  const { data } = await octokit.search.repos({
    q: args.query,
    per_page: args.perPage ?? 20,
    page: args.page ?? 1,
  });
  return data.items;
}

export async function searchCodeImpl(
  agent: GithubAgent,
  args: SearchReposArgs,
): Promise<any[]> {
  const env = (agent as any).env as Env;
  const octokit = await getOctokitAsUser(env);
  const { data } = await octokit.search.code({
    q: args.query,
    per_page: args.perPage ?? 20,
    page: args.page ?? 1,
  });
  return data.items;
}
```

**Modify:** [`src/backend/src/ai/agents/backend/GithubAgent/index.ts`](../../../src/backend/src/ai/agents/backend/GithubAgent/index.ts)

Add two `@callable()` methods next to the existing `@callable` block. Follow the pattern established by `checkDuplicatePR` / `getFileContent` / `createPullRequest`:

```typescript
@callable()
async searchRepositories(args: SearchReposArgs): Promise<any[]> {
  const { searchRepositoriesImpl } = await import('./methods/search');
  return searchRepositoriesImpl(this, args);
}

@callable()
async searchCode(args: SearchReposArgs): Promise<any[]> {
  const { searchCodeImpl } = await import('./methods/search');
  return searchCodeImpl(this, args);
}
```

Return the raw `data.items` arrays — do not normalize. Consumers want the same shape Octokit returns.

---

### C5 — ResearchAgent: delegate GitHub search

**File:** [`src/backend/src/ai/agents/backend/ResearchAgent/methods/github.ts`](../../../src/backend/src/ai/agents/backend/ResearchAgent/methods/github.ts)

**Before (lines 7-36 sketch):**
```typescript
export async function searchGithub(agent, query, opts) {
  try {
    const { getOctokit } = await import("@services/octokit/core");
    const octokit = await getOctokit((agent as any).env);
    const { data } = await octokit.search.repos({ q: query, per_page: opts?.perPage ?? 20 });
    return data.items;
  } catch (err) { /* ... */ }
}
```

**After:**
```typescript
export async function searchGithub(agent: any, query: string, opts?: { perPage?: number }) {
  try {
    const githubAgent = (agent as any).getPeerAgent((agent as any).env.GITHUB_AGENT);
    const items = await githubAgent.searchRepositories({
      query,
      perPage: opts?.perPage ?? 20,
    });
    return items;
  } catch (err) {
    (agent as any).logger?.warn?.('[ResearchAgent] searchGithub via GithubAgent failed', err);
    return [];
  }
}
```

Delete the `@services/octokit/core` import. Do **not** re-export Octokit from anywhere in ResearchAgent.

---

### C6 — Lint rule / rule doc

Add to `.eslintrc.cjs` (or the project's lint config):

```javascript
{
  files: [
    'src/backend/src/ai/agents/**/*.ts',
    '!src/backend/src/ai/agents/chat/CloudflareAgent/**',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: '@/ai/mcp/mcp-client', message: 'Use cloudflareAgent.agenticSearch() via getPeerAgent(env.CLOUDFLARE_AGENT). See docs/20260417/standardize_agents/v7/PRD.md.' },
      ],
      patterns: [
        { group: ['@/ai/mcp/*'], message: 'MCP access is CloudflareAgent\'s. Use getPeerAgent(env.CLOUDFLARE_AGENT).' },
      ],
    }],
  },
},
{
  files: [
    'src/backend/src/ai/agents/**/*.ts',
    '!src/backend/src/ai/agents/backend/GithubAgent/**',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@octokit/*', '@services/octokit/*', '@/services/octokit/*'], message: 'Octokit access is GithubAgent\'s. Use getPeerAgent(env.GITHUB_AGENT).' },
      ],
    }],
  },
},
{
  files: ['src/backend/src/ai/agents/chat/CoordinatorAgent/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@octokit/*', '@/ai/mcp/*', '@/cloudflare/*', '@services/*', '@/services/*'], message: 'CoordinatorAgent is a pure router. Route via getPeerAgent; never import service SDKs.' },
      ],
    }],
  },
},
```

Also create `.agent/rules/agent-specialist-delegation.md` describing the same rule in prose, so future LLM-driven PRs see it.

If the project does not use ESLint, encode C6 as a `.agent/rules/` markdown doc that describes the import discipline and the reproducer greps from `AUDIT_FINDINGS.md §9`.

---

### C9 — CoordinatorAgent routing contract

**File:** [`src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts`](../../../src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts)

Add a header comment immediately above the class declaration:

```typescript
/**
 * CoordinatorAgent — Frontend triage broker.
 *
 * CONTRACT (enforced by lint; see docs/20260417/standardize_agents/v7/PRD.md C9):
 * - This agent is a PURE ROUTER. It must never call an external service directly.
 * - Allowed imports: `agents`, `@/ai/providers/agent-support/base-chat-agent`, local types.
 * - Forbidden imports: @octokit/*, @/ai/mcp/*, @/cloudflare/*, @services/*, any third-party SDK.
 * - All domain work routes to a backend specialist via `this.getPeerAgent<T>(this.env.FOO_AGENT)`.
 * - If you need new functionality here, add a new @callable on the relevant specialist first.
 */
```

The ESLint override from C6 enforces the same.

---

## Key Files Reference

| File | Action |
|------|--------|
| `src/backend/src/ai/agents/backend/GithubAgent/methods/search.ts` | **new** (C4) |
| `src/backend/src/ai/agents/backend/GithubAgent/index.ts` | add two `@callable` (C4) |
| `src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts` | delete 5 lines (C1) |
| `src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts` | delete 8 lines (C2) |
| `src/backend/src/ai/agents/backend/OrchestratorAgent/methods/reverse-engineering.ts` | import swap + call swap (C3) |
| `src/backend/src/ai/agents/backend/ResearchAgent/methods/github.ts` | import swap + RPC call (C5) |
| `.eslintrc.cjs` (or project equivalent) | add 3 scoped overrides (C6, C9) |
| `.agent/rules/agent-specialist-delegation.md` | **new** (C6) |
| `src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts` | header comment (C9) |
| `src/backend/src/services/planning/babysitter/utils.ts` | refactor **or** comment (C7) |
| `docs/20260417/standardize_agents/v5/followup/PRD.md` | mark A6 superseded (C8) |

---

## Verification Checklist

Run these commands. Every one must pass before opening the PR.

```bash
# 1. Type-check
npx tsc --noEmit

# 2. Bypass greps — zero matches outside sanctioned dirs
rg -n "from ['\"]@/ai/mcp/mcp-client" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent" \
  | wc -l   # must be 0

rg -n "@octokit|getOctokit|new Octokit" src/backend/src/ai/agents \
  | grep -v "backend/GithubAgent" \
  | wc -l   # must be 0

rg -n "rewriteQuestionForMCP" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent" \
  | wc -l   # must be 0

# 3. CoordinatorAgent import discipline
rg -n "from ['\"]@/cloudflare|@/ai/mcp|@octokit|@services" \
  src/backend/src/ai/agents/chat/CoordinatorAgent \
  | wc -l   # must be 0

# 4. New @callable surface
rg -n "@callable" src/backend/src/ai/agents/backend/GithubAgent \
  | grep -E "searchRepositories|searchCode" \
  | wc -l   # must be 2

# 5. Lint (if ESLint configured)
npx eslint src/backend/src/ai/agents
# Expect: no errors

# 6. Build
npx wrangler deploy --dry-run
# Expect: success
```

---

## Execution Discipline

- Commit per task (C1, C2, C3, …). One task per commit makes review trivial.
- Do not batch unrelated edits.
- Do not reformat files you're not changing — the diff should show exactly the bypass removal.
- After each commit, run the verification slice relevant to that task.
- If a fix requires touching a file not listed in Key Files Reference, stop and ask — it suggests the audit missed something.
