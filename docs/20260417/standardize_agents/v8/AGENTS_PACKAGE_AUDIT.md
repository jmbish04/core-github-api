# Agents SDK V8 Package Audit

## Pinned Version

| Package | Previous | Pinned | Rationale |
|---------|----------|--------|-----------|
| `agents` | `"latest"` (resolved 0.10.0) | `^0.11.5` | Ships `agents/browser/ai`, `agents/observability`, `agents/codemode/ai` subpath exports |
| `@cloudflare/think` | *(new)* | `^0.4.0` | Think base class for opinionated chat agents |
| `@cloudflare/ai-chat` | `^0.4.0` | `^0.5.1` | Required by Think for `useAgentChat` |
| `workers-ai-provider` | *(new)* | `^3.1.12` | Required by Think `getModel()` for `createWorkersAI()` |
| `@cloudflare/workers-types` | `"latest"` | `^4.20260425.1` | Pin to concrete typings |
| `zod` | `"latest"` | `^3.25.2` | Codebase uses Zod 3 API; prevents silent Zod 4 breakage |
| `zod-to-json-schema` | `"latest"` | `^3.25.2` | Companion to Zod 3 |
| `@hono/swagger-ui` | `"latest"` | `^0.6.1` | Pin |
| `@hono/zod-openapi` | `"latest"` | `^1.3.0` | Pin |

## Breaking-Change Assessment (agents 0.10.0 → 0.11.5)

### New Subpath Exports (additive — no breakage)

| Export | Purpose | Used By |
|--------|---------|---------|
| `agents/browser/ai` | `createBrowserTools` wrapper for CDP-based page inspection | V8-06, V8-07, V8-08 |
| `agents/observability` | `subscribe()` helper + `Observability` interface | V8-02, V8-11 |
| `agents/codemode/ai` | Re-export of `@cloudflare/codemode/ai` (convenience) | V8-09, V8-10 |
| `agents/chat` | Chat protocol primitives | Existing (unchanged) |
| `agents/workflows` | Workflow bindings | Existing (unchanged) |
| `agents/schedule` | Schedule helpers | Existing (unchanged) |

### Resolved Exports (confirmed still present)

- ✅ `Agent` — base class
- ✅ `callable` — decorator
- ✅ `StreamingResponse` — streaming RPC
- ✅ `AIChatAgent` — from `agents/ai-chat-agent`
- ✅ `routeAgentRequest` — main entrypoint router
- ✅ `getAgentByName` — peer agent resolution

### No Breaking Changes Detected

The 0.10.0 → 0.11.5 upgrade is purely additive. All existing imports resolve correctly.

## CI Guard Against `"latest"` Regression

A verification step is included in `scripts/verify-v8.sh`:

```bash
# Must return 0 — no "latest" version specifiers allowed
rg -n '"latest"' package.json | wc -l
```

This check MUST pass before any deployment.

## Smoke Evidence

> **TODO (V8-03)**: Paste Tail Worker capture of `agents:rpc` event after deployment smoke test.
