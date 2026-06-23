# v7 — Product Requirements Document

**Date:** 2026-04-23
**Parent plan:** `docs/20260417/standardize_agents/v5/PLAN.md` (v5 architecture still holds)
**Supersedes:** v5/followup task **A6** (GuardrailAgent ↔ CloudflareAgent consultation) — merged and expanded here
**Scope:** Close the remaining collaboration gaps where non-specialist agents bypass CloudflareAgent / GithubAgent by talking to external services directly. Codify the new `chat/` vs `backend/` taxonomy. Establish CoordinatorAgent as the frontend triage contract.

---

## Context

The repository now organizes Durable Object agents into two tiers:

- **`src/backend/src/ai/agents/chat/`** — `BaseChatAgent` subclasses that stream to assistant-ui (CoordinatorAgent, CloudflareAgent, WorkshopAgent).
- **`src/backend/src/ai/agents/backend/`** — `BaseAgent` subclasses that only expose `@callable` RPC (OrchestratorAgent, EngineerAgent, GuardrailAgent, ResearchAgent, GithubAgent, DesignAgent, LearningAgent, CollaborationAgent).

The new **CoordinatorAgent** is the frontend's generic chat entry. Its role is *pure routing* — it invokes specialist backend agents via `getPeerAgent<T>()` and never calls external services itself. This taxonomy gives us a natural enforcement point for the "specialist is single source of truth" rule: path globs under `chat/` and `backend/` map 1:1 onto the contract.

An audit (see `AUDIT_FINDINGS.md`) found five remaining bypasses where agents still call `queryMCP`, `rewriteQuestionForMCP`, or `getOctokit` directly instead of going through the specialist. Four are trivial surgical fixes; one requires adding a small `@callable` surface to GithubAgent. The goal of v7 is to close those five gaps and add a guardrail so they can't come back.

### What's already done (verified 2026-04-23)

| Area | Status |
|------|--------|
| `chat/` vs `backend/` directory split | ✅ Landed |
| CloudflareAgent owns `queryMCP` + `rewriteQuestionForMCP` internally, exposed as `agenticSearch()` `@callable` | ✅ Landed ([`chat/CloudflareAgent/index.ts:157-180`](../../../src/backend/src/ai/agents/chat/CloudflareAgent/index.ts)) |
| GithubAgent owns Octokit internally; exposes `checkDuplicatePR`, `getFileContent`, `createPullRequest` as `@callable` | ✅ Landed (consumed by LearningAgent) |
| LearningAgent delegates *all GitHub ops* via `getPeerAgent(GITHUB_AGENT)` | ✅ Landed ([`backend/LearningAgent/methods/diagnose-health.ts:128,154,180`](../../../src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts)) |
| GuardrailAgent delegates MCP queries via `getPeerAgent(CLOUDFLARE_AGENT).agenticSearch()` | ✅ Partially — the delegation call exists but a redundant local rewrite precedes it |
| CoordinatorAgent scaffold (router, zero external imports) | ✅ Landed |

### What remains (this PRD addresses)

Four surgical code fixes + one new `@callable` + three process guardrails:

1. Remove double-rewrite in GuardrailAgent (C1).
2. Remove double-rewrite in LearningAgent (C2).
3. Delegate OrchestratorAgent reverse-engineering MCP call (C3).
4. Add `searchRepositories` / `searchCode` `@callable` to GithubAgent (C4) — prerequisite for C5.
5. Switch ResearchAgent from direct Octokit to GithubAgent RPC (C5).
6. Add a `no-restricted-imports`-style rule leveraging the `chat/` + `backend/` path globs (C6).
7. Decide babysitter utility's fate (C7).
8. Codify CoordinatorAgent routing contract (C9).
9. Mark v5 followup A6 as superseded (C8).

---

## Scope

### 1. Specialist surface area

| Task | File | What's needed |
|------|------|---------------|
| **C4** — Add `searchRepositories` and `searchCode` `@callable` to GithubAgent | [`backend/GithubAgent/index.ts`](../../../src/backend/src/ai/agents/backend/GithubAgent/index.ts) + new `backend/GithubAgent/methods/search.ts` | Two `@callable` methods wrapping `getOctokitAsUser(env).search.repos(...)` and `.search.code(...)`. Return the Octokit `items` arrays (don't over-normalize — consumers want raw). Accept `{ query: string; perPage?: number; page?: number }`. Log via `this.logger`. |

### 2. Remove bypasses in agents

| Task | File | Change |
|------|------|--------|
| **C1** — GuardrailAgent: drop local rewrite | [`backend/GuardrailAgent/methods/cloudflare-docs.ts`](../../../src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts) (lines 83–109) | Delete lines 99–102 (`const mcpQuestion = await agent.getAI().rewriteQuestionForMCP(...)`). Pass `mcpQuestionBase` directly to `cloudflareAgent.agenticSearch(mcpQuestionBase, { files, rules })`. CloudflareAgent rewrites internally. |
| **C2** — LearningAgent: drop local rewrite | [`backend/LearningAgent/methods/diagnose-health.ts`](../../../src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts) (lines 52–66) | Delete lines 53–59 (`rewritten = ...` block). Pass raw `mcpQuery` to `cloudflareAgent.agenticSearch(mcpQuery)`. |
| **C3** — OrchestratorAgent: delegate reverse-engineering MCP | [`backend/OrchestratorAgent/methods/reverse-engineering.ts`](../../../src/backend/src/ai/agents/backend/OrchestratorAgent/methods/reverse-engineering.ts) (line 18 import; line 113 call) | Remove `import { queryMCP } from '@/ai/mcp/mcp-client'`. Replace line 113 with `this.getPeerAgent<any>(this.env.CLOUDFLARE_AGENT).agenticSearch(query)`. Preserve the existing try/catch graceful-degradation shape. |
| **C5** — ResearchAgent: delegate GitHub search | [`backend/ResearchAgent/methods/github.ts`](../../../src/backend/src/ai/agents/backend/ResearchAgent/methods/github.ts) (lines 7–36) | Remove the dynamic `import("@services/octokit/core")` and `octokit.search.repos(...)`. Call `(agent as any).getPeerAgent((agent as any).env.GITHUB_AGENT).searchRepositories({ query, perPage })`. Depends on **C4**. |
| **C2a** — Audit `agenticSearch` signature | [`chat/CloudflareAgent/index.ts:157-180`](../../../src/backend/src/ai/agents/chat/CloudflareAgent/index.ts) | Confirm `agenticSearch(question: string, context?: Record<string, any>)` matches every caller's shape. If today's signature requires `context`, accept `context?:` and treat absence as `undefined`. This is an audit-only task unless a mismatch is found. |

### 3. Guardrails & cleanup

| Task | File | What |
|------|------|------|
| **C6** — Path-scoped import guard | `.eslintrc.cjs` (or equivalent) + `.agent/rules/agent-specialist-delegation.md` (new) | Add `no-restricted-imports` overrides: `chat/**/!(CloudflareAgent)/**` and `backend/**/!(GithubAgent|GuardrailAgent)/**` may not import `@/ai/mcp/mcp-client` / `@octokit/*` / `@services/octokit/*`. *(GuardrailAgent is listed because it still reads Cloudflare docs as a second-opinion channel — it delegates but the allowlist acknowledges its coupling.)* Document the rule alongside in `.agent/rules/`. |
| **C9** — CoordinatorAgent routing contract | [`chat/CoordinatorAgent/index.ts`](../../../src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts) | Add a file-header comment enumerating allowed imports (`agents`, `@/ai/providers/agent-support/base-chat-agent`, types). Add an ESLint rule for `chat/CoordinatorAgent/**` that denies all of `@octokit/*`, `@/ai/mcp/*`, `@/cloudflare/*`, `@services/*`. Router may only `getPeerAgent`. |
| **C7** — Babysitter utility decision | [`services/planning/babysitter/utils.ts:47`](../../../src/backend/src/services/planning/babysitter/utils.ts) | Two acceptable outcomes: (a) refactor to accept an agent instance and delegate via `getPeerAgent(env.CLOUDFLARE_AGENT).agenticSearch(...)`, or (b) add a comment explicitly marking this as the *one* sanctioned non-agent `queryMCP` call site, with rationale (babysitter runs as a scheduled worker, not inside an agent DO). Either is fine — pick one and document. |
| **C8** — Mark v5 followup A6 superseded | [`v5/followup/PRD.md`](../v5/followup/PRD.md) (A6 row) | Edit A6's "What's Missing" to append: *"Superseded by v7 C1 (double-rewrite fix)."* |

---

## Explicit Non-Goals

- No new agents. CoordinatorAgent stays a placeholder router — feature work belongs in a separate PR.
- No `@callable` signature changes on existing methods.
- No changes to `BaseAgent` / `BaseChatAgent`.
- No new vendor SDKs.
- No frontend work.
- No wrangler migration changes.
- No formal TypeScript RPC interface files for specialists — that's a v8 candidate flagged in AUDIT_FINDINGS §8.
- No refactor of GithubAgent's internal `methods/shared.ts` — it's the legitimate Octokit owner.

---

## Open Questions

1. **`searchRepositories` return shape (C4).** Raw Octokit `items` array or normalized DTO? Recommend **raw** (don't leak abstraction across RPC boundaries without a clear reason). Flag for decision before implementation.
2. **Babysitter utility (C7).** Is `services/planning/babysitter/utils.ts` expected to run *only* in the scheduled-worker path, or is it ever instantiated inside an agent? If the latter, (a) is mandatory.
3. **ESLint vs. runtime guard (C6).** Project uses ESLint? If not, encode as a `.agent/rules/` markdown rule that the coding agent checks at PR time. Either is acceptable.
4. **`chat/` peers with local AI logic.** CloudflareAgent and WorkshopAgent sit in `chat/` and may call `this.ai.*` for their own purposes. Rule 6 must not accidentally forbid `this.ai.generateText`; it only targets *external service clients*. Confirm the glob.

---

## Verification

After all tasks land:

```bash
# 1. Type-check
npx tsc --noEmit

# 2. Bypass greps must return zero outside specialist dirs
rg -n "from ['\"]@/ai/mcp/mcp-client" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent"
rg -n "@octokit|getOctokit|new Octokit" src/backend/src/ai/agents \
  | grep -v "backend/GithubAgent"
rg -n "rewriteQuestionForMCP" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent"

# 3. CoordinatorAgent must not import any service SDK
rg -n "from ['\"]@/cloudflare|@/ai/mcp|@octokit|@services" \
  src/backend/src/ai/agents/chat/CoordinatorAgent
# Expect: zero

# 4. GithubAgent exposes searchRepositories / searchCode as @callable
rg -n "@callable\(\)" src/backend/src/ai/agents/backend/GithubAgent | \
  grep -E "searchRepositories|searchCode"
# Expect: two matches

# 5. Runtime smoke (post-deploy)
# - ResearchAgent.research(topic) completes without "getOctokit" logs in the agent path
# - GuardrailAgent.evaluatePayload() executes exactly one rewriteQuestionForMCP call (check AI logs)
# - OrchestratorAgent reverse-engineering sprint produces non-empty cloudflareDocs context
```

---

## Critical Files Reference

| Area | Path |
|------|------|
| Sanctioned MCP owner | `src/backend/src/ai/agents/chat/CloudflareAgent/index.ts` (`agenticSearch` at 157–180) |
| Sanctioned Octokit owner | `src/backend/src/ai/agents/backend/GithubAgent/methods/shared.ts` |
| GuardrailAgent MCP delegation | `src/backend/src/ai/agents/backend/GuardrailAgent/methods/cloudflare-docs.ts` (C1) |
| LearningAgent MCP delegation | `src/backend/src/ai/agents/backend/LearningAgent/methods/diagnose-health.ts` (C2) |
| OrchestratorAgent reverse-engineering | `src/backend/src/ai/agents/backend/OrchestratorAgent/methods/reverse-engineering.ts` (C3) |
| GithubAgent new `@callable` | `src/backend/src/ai/agents/backend/GithubAgent/methods/search.ts` (new, C4) |
| ResearchAgent GH delegation | `src/backend/src/ai/agents/backend/ResearchAgent/methods/github.ts` (C5) |
| Lint rule / rule doc | `.eslintrc.cjs` + `.agent/rules/agent-specialist-delegation.md` (C6) |
| Babysitter utility | `src/backend/src/services/planning/babysitter/utils.ts` (C7) |
| CoordinatorAgent contract | `src/backend/src/ai/agents/chat/CoordinatorAgent/index.ts` (C9) |
| v5 followup A6 note | `docs/20260417/standardize_agents/v5/followup/PRD.md` (C8) |
| Precedent artifacts | `v6/PROMPT.md`, `v6/TASKS.json`, `v5/followup/PRD.md` |

---

## Execution Order

```
C4 (GithubAgent new @callable — unblocks C5)
   ↓
C1, C2, C3, C5 — parallel; independent file edits
   ↓
C2a — audit agenticSearch signature during C1/C2 review
   ↓
C6, C9 — guardrails (parallel)
   ↓
C7 — babysitter decision + implementation
   ↓
C8 — v5 followup bookkeeping (last)
   ↓
Final verification (§Verification block)
```

Each batch ends with `npx tsc --noEmit` passing and a commit.
