# Agent Specialist Delegation Rule

> **Enforcement level:** Mandatory — all code under `src/backend/src/ai/agents/`  
> **Introduced by:** v7 PRD — `docs/20260417/standardize_agents/v7/PRD.md`  
> **Verification:** grep-based CI guard — `scripts/check-agent-delegation.sh`

---

## Rule

**Specialist agents are the single source of truth for their domain.** No agent outside the specialist's directory may import or directly call the specialist's underlying SDK/service. Instead, agents consume specialist functionality via `@callable` RPC methods accessed through `getPeerAgent(env.FOO_AGENT)`.

---

## Domain Ownership Table

| Domain | Specialist Agent | Sanctioned Directory | Owned Imports |
|--------|-----------------|---------------------|---------------|
| **Cloudflare Docs / MCP** | `CloudflareAgent` | `chat/CloudflareAgent/` | `@/ai/mcp/*`, `queryMCP`, `rewriteQuestionForMCP` |
| **GitHub / Octokit** | `GithubAgent` | `backend/GithubAgent/` | `@octokit/*`, `@services/octokit/*`, `@/services/octokit/*`, `@/services/github/client` |

### CoordinatorAgent — Pure Router Contract

`chat/CoordinatorAgent/` is a **pure router**. It must never import any service SDK or domain client. Allowed imports are limited to:
- `agents` (for `callable`, `getAgentByName`, `StreamingResponse`, `getPeerAgent`)
- `@/ai/providers/agent-support/base-chat-agent`
- Local `./types`

**Forbidden in CoordinatorAgent:**
- `@octokit/*`
- `@/ai/mcp/*`
- `@/cloudflare/*`
- `@services/*`, `@/services/*`
- Any third-party SDK

---

## How to Consume Specialist APIs

### Cloudflare Docs (CloudflareAgent)

```typescript
// ✅ CORRECT — delegate via getPeerAgent
const cloudflareAgent = (agent as any).getPeerAgent((env as any).CLOUDFLARE_AGENT);
const result = await cloudflareAgent.agenticSearch(rawQuestion);
const docs = result?.docsContext ?? null;
```

```typescript
// ❌ WRONG — bypasses CloudflareAgent
import { queryMCP } from '@/ai/mcp/mcp-client';
const result = await queryMCP(env, question, 'MyAgent');
```

```typescript
// ❌ WRONG — double-rewrite (CloudflareAgent.agenticSearch rewrites internally)
const rewritten = await ai.rewriteQuestionForMCP(question);
const result = await cloudflareAgent.agenticSearch(rewritten);
```

### GitHub Search (GithubAgent)

```typescript
// ✅ CORRECT — delegate via getPeerAgent
const githubAgent = (agent as any).getPeerAgent((env as any).GITHUB_AGENT);
const items = await githubAgent.searchRepositories({ query, perPage: 20 });
const codeResults = await githubAgent.searchCode(query, repoContext);
```

```typescript
// ❌ WRONG — bypasses GithubAgent
import { getOctokit } from "@services/octokit/core";
const octokit = await getOctokit(env);
```

---

## Sanctioned Exception

**`src/backend/src/services/planning/babysitter/utils.ts`** calls `queryMCP` directly. This is the **one** sanctioned non-agent call site because the babysitter runs in scheduled-worker context with no Durable Object instance available. The exception is documented inline at the call site. Do NOT copy this pattern into any code path that has access to an agent instance.

---

## Enforcement

Since no ESLint config exists in this project, enforcement is via:

1. **This rule document** — LLM-driven PR reviews must check compliance
2. **Verification greps** — run before merging any PR that touches `src/backend/src/ai/agents/`:

```bash
# Only CloudflareAgent may import MCP client
rg -n "from ['\"]@/ai/mcp/mcp-client" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent" | wc -l   # must be 0

# Only GithubAgent may import Octokit
rg -n "@octokit|getOctokit|new Octokit" src/backend/src/ai/agents \
  | grep -v "backend/GithubAgent" | wc -l   # must be 0

# No agent outside CloudflareAgent calls rewriteQuestionForMCP
rg -n "rewriteQuestionForMCP" src/backend/src/ai/agents \
  | grep -v "chat/CloudflareAgent" | wc -l   # must be 0

# CoordinatorAgent imports no service SDKs
rg -n "from ['\"]@/cloudflare|@/ai/mcp|@octokit|@services" \
  src/backend/src/ai/agents/chat/CoordinatorAgent | wc -l   # must be 0
```

3. **CI guard script** — `scripts/check-agent-delegation.sh` (fails the build on violations)

---

## Adding New Specialist Surface Area

If your agent needs functionality that a specialist owns:

1. Check if the specialist already exposes a `@callable` method for it
2. If not, **add a new `@callable` method on the specialist first**
3. Consume via `getPeerAgent(env.FOO_AGENT).newMethod(args)` from your agent
4. Wrap in try/catch with graceful degradation (see `GuardrailAgent/methods/cloudflare-docs.ts` for reference)

**Never import the specialist's internal SDK into your agent.** The specialist boundary exists to ensure single-owner maintenance, consistent caching, and centralized error handling.
