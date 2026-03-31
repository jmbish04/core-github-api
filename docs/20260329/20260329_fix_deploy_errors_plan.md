# Coding Agent Prompt — Production Fixes + AI Gateway Architecture Refactor

## Context

After deploying `core-github-api` (Cloudflare Workers + Astro + React + Hono monolith), `wrangler.log` reveals cascading failures: Workers AI routing errors (`Could not route to /accounts/{id}/ai/chat/completions`), HealthDiagnostician crashes, cross-request promise warnings, and CF enrichment auth failures. The root cause is incorrect AI Gateway URL construction — specifically, the compat endpoint is missing the `/v1/` prefix and auth headers are inconsistently applied. This prompt covers a strategic refactor to centralize AI Gateway logic, fix all providers, fix the sidebar UX, and improve observability.

---

## Prompt for Coding Agent

```
You are executing a strategic refactor + production fix in /Volumes/Projects/workers/core-github-api, a Cloudflare Workers monolith (Hono backend + Astro/React frontend). Address ALL 6 tasks below in order. Read every file referenced before making changes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 1: Assess src/backend/src/utils/hono.ts — KEEP IT

File: src/backend/src/utils/hono.ts

This file exports the shared `Bindings` type and a pre-configured `OpenAPIHono` app instance. At least 10 files import from it. DO NOT remove or refactor this file. Confirm it is correctly used and move on.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 2: Fix Sidebar — Static Collapsible with Hamburger Toggle

Files to modify:
- src/frontend/src/layouts/RootLayout.tsx
- src/frontend/src/components/layout/AppSidebar.tsx

Current behavior: Sidebar uses `hidden md:flex` (invisible on mobile) with a Sheet-based mobile drawer. This is wrong.

Required behavior:
- Sidebar is a STATIC collapsible panel on ALL breakpoints (mobile AND desktop)
- A hamburger button (☰) toggles the sidebar open/closed
- When collapsed: sidebar is completely hidden (width 0), content takes full width
- When expanded: sidebar slides in from the left (264px width), overlaying or pushing content
- Default state: COLLAPSED on mobile (<768px), EXPANDED on desktop (>=768px)
- The hamburger toggle button must be visible in the top-left of the header/navbar at ALL times
- Remove the Sheet/Drawer mobile pattern entirely
- Use a single sidebar implementation for all breakpoints — no conditional rendering based on screen size

Implementation approach:
1. Add `isSidebarOpen` state to RootLayout (or use a context/zustand store if one exists)
2. Initialize based on window width: `useState(window.innerWidth >= 768)`
3. Sidebar: `transition-all duration-300` with conditional `w-[264px]` vs `w-0 overflow-hidden`
4. Hamburger button: always visible in the top bar, calls `toggleSidebar()`
5. On mobile, optionally add a backdrop overlay when sidebar is open
6. Remove all `hidden md:flex` / `md:hidden` conditional visibility classes from sidebar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 3: Unified AI Gateway Architecture Refactor (CRITICAL)

This is the most important task. The wrangler.log shows:
```
"Could not route to /accounts/b3304b14848de15c72c24a14b0cd187d/ai/chat/completions"
```

The root cause: in `src/backend/src/ai/providers/config.ts`, the `getAiGatewayUrl()` function constructs the Workers AI compat endpoint as `${gateway.getUrl('compat')}/chat/completions` — MISSING the `/v1/` prefix. The correct path is `/v1/chat/completions`. Additionally, auth headers are inconsistently applied across providers and the gateway logic is split between `ai/utils/ai-gateway.ts` and `ai/providers/config.ts`.

**Objective**: Relocate and refactor the AI Gateway management logic to serve as the singular source of truth for all AI providers. Merge `src/ai/utils/ai-gateway.ts` into `src/ai/providers/ai-gateway.ts` and update all providers to use this centralized logic.

READ ALL OF THESE FILES FIRST before making any changes:
- src/backend/src/ai/utils/ai-gateway.ts (current AIGateway class)
- src/backend/src/ai/providers/config.ts (normalizeProvider, getAiGatewayUrl, getCompatModelName)
- src/backend/src/ai/providers/worker-ai.ts
- src/backend/src/ai/providers/openai.ts
- src/backend/src/ai/providers/anthropic.ts
- src/backend/src/ai/providers/gemini.ts
- src/backend/src/ai/providers/jules.ts
- src/backend/src/ai/providers/index.ts
- src/backend/src/ai/gateway-health.ts
- src/backend/src/ai/health.ts
- src/backend/src/ai/utils/diagnostician.ts

**Step 1: Create src/ai/providers/ai-gateway.ts** — the new centralized gateway

Move all logic from `ai/utils/ai-gateway.ts` into `src/ai/providers/ai-gateway.ts` with these corrections:

a. **Fix URL Construction**: The compatibility endpoint MUST follow the `/v1/chat/completions` pattern:
   ```typescript
   // WRONG (current — causes "Could not route to" error):
   return `${await gateway.getUrl('compat')}/chat/completions`;

   // CORRECT:
   return `${await gateway.getUrl('compat')}/v1/chat/completions`;
   ```

b. **Unify Auth Logic**: Strictly enforce the BYOK hierarchy:
   - If `AI_GATEWAY_TOKEN` is present → use `cf-aig-authorization: Bearer {token}` and OMIT the standard `Authorization` header entirely
   - If no gateway token → use `Authorization: Bearer {providerApiKey}` as normal
   - NEVER send both headers simultaneously

c. **Ensure `getBaseUrl()` returns empty `apiKey` in BYOK mode** (this already works but verify after relocation)

d. **No trailing slashes**: Strip trailing slashes from all base URLs before returning

**Step 2: Refactor src/ai/providers/config.ts**

- Remove the redundant `normalizeProvider()` string-mapping logic — delegate to `AIGateway.normalizeProvider()` from the new file
- Refactor `getAiGatewayUrl()` to use `AIGateway.getBaseUrl()` for consistent endpoint generation across all use cases (or remove it entirely if `AIGateway.getBaseUrl()` covers all cases)
- Keep `getCompatModelName()` — it correctly handles `@cf/` to `workers-ai/@cf/` prefixes for OpenAI-compatible formatting

**Step 3: Standardize Provider Implementations**

- **Workers AI (`worker-ai.ts`)**: Update `getAIClient` to call `AIGateway.createUniversalClient(env, "workers-ai")`. Use `AIGateway.normalizeWorkerAiModel()` for all model strings. Verify the compat endpoint URL is now correct.

- **OpenAI (`openai.ts`)**: Use `AIGateway.createUniversalClient(env, "openai")` to handle both native OpenAI routing and Workers AI compatibility routing. (Already partially does this — verify and clean up any manual URL construction.)

- **Anthropic (`anthropic.ts`)**: Update `verifyApiKey` and generators to use the `AIGateway` universal client/runner pattern. (Already partially does this — verify and clean up.)

- **Gemini (`gemini.ts`)**: Update `getGeminiClient` to use `AIGateway.getBaseUrl()`. **CRITICAL FIX**: Only append `?key={apiKey}` if `apiKey` is non-empty. In BYOK mode, `apiKey` is empty, so appending `?key=` with an empty string causes Google API 400 errors. Fix:
  ```typescript
  // WRONG:
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // CORRECT:
  const keyParam = apiKey ? `?key=${apiKey}` : '';
  const url = `${baseUrl}/v1beta/models/${model}:generateContent${keyParam}`;
  ```

- **Jules (`jules.ts`)**: No changes needed — uses native SDK, not gateway.

**Step 4: Update imports and exports**

- Update `src/ai/providers/index.ts` to export from the new `ai-gateway.ts` location
- Update ALL files that import from `@/ai/utils/ai-gateway` to import from `@/ai/providers/ai-gateway` instead
- Delete the old `src/ai/utils/ai-gateway.ts` file (or leave a re-export stub if many files import from it)
- Search the entire codebase for any remaining imports of the old path

**Step 5: Error Handling & Sanitization**

- All providers must use `cleanJsonOutput` from `@/ai/utils/sanitizer` (verify this is already the case)
- Ensure no trailing slashes remain on base URLs before appending paths

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 4: Improve Traceability & Transparency in AI Providers + HealthDiagnostician

Add structured logging throughout the AI stack so failures are diagnosable from wrangler logs. Use a consistent `[ComponentName]` prefix format.

Files:
- src/backend/src/ai/providers/ai-gateway.ts (new location)
- src/backend/src/ai/providers/worker-ai.ts
- src/backend/src/ai/providers/openai.ts
- src/backend/src/ai/providers/anthropic.ts
- src/backend/src/ai/providers/gemini.ts
- src/backend/src/ai/providers/index.ts
- src/backend/src/ai/utils/diagnostician.ts
- src/backend/src/ai/gateway-health.ts

Logging requirements:

1. **AIGateway** (`ai-gateway.ts`):
   - `console.log("[AIGateway] provider=%s gatewayUrl=%s", provider, url)` when constructing base URL
   - `console.log("[AIGateway] mode=%s", aigToken ? "BYOK" : "direct")` in createUniversalClient

2. **Each AI provider** (worker-ai, openai, anthropic, gemini):
   - Log full request URL before fetch: `console.log("[WorkerAI] request url=%s model=%s", url, model)`
   - Log response status: `console.log("[WorkerAI] response status=%d", res.status)`
   - On error, log response body: `console.error("[WorkerAI] error body=%s", await res.text())`

3. **Provider router** (index.ts):
   - Log which provider is selected: `console.log("[AIRouter] using provider=%s", provider)`
   - Log fallback attempts: `console.log("[AIRouter] primary=%s failed, falling back to %s", primary, fallback)`

4. **HealthDiagnostician** (`diagnostician.ts`):
   - Log when `analyzeFailure()` is called and with what context
   - **Add try/catch around the AI call** — since Workers AI is what's failing, the diagnostician crashes too (cascading failure). On failure, return a structured fallback:
     ```typescript
     { diagnosis: "AI diagnostic unavailable", confidence: 0, rawError: error.message }
     ```
   - Log success/failure of diagnostic AI calls

5. **Gateway health** (`gateway-health.ts`):
   - Log each provider check with timing: `console.log("[GatewayHealth] %s: %dms %s", provider, elapsed, status)`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 5: Fix Cross-Request Promise Resolution Warnings

The wrangler.log shows repeated warnings:
```
(warn) Warning: A promise was resolved or rejected from a different request context than the one that created it.
(trace) Sync._tryToRun > Job.doExecute
```

This comes from Drizzle ORM sharing database connection state across request boundaries in the Workers runtime.

Investigation steps:
- Search for where Drizzle is instantiated — look for module-level `db` singletons
- The fix: ensure the Drizzle client is created PER-REQUEST using the request's `env.DB` binding, NOT cached at module scope

Pattern to find and fix:
```typescript
// BAD: module-level singleton
const db = drizzle(someGlobalBinding);
export { db };

// GOOD: per-request factory
export function getDb(env: Env) {
  return drizzle(env.DB);
}
```

If Drizzle is already instantiated per-request inside middleware/handlers using the current request's env, that's fine. But if there's ANY module-level caching of the db instance or connection, refactor it to be request-scoped.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 6: Deploy & Verify

After all fixes:

1. Build frontend: `cd src/frontend && npx astro build`
2. Deploy: `pnpm run deploy` (from project root)
3. Tail logs: `pnpm run deploy:tail` or `npx wrangler tail`
4. Verify in logs:
   - No more "Could not route to /accounts/.../ai/chat/completions" errors
   - `[AIGateway]` logs show correct URLs with `/v1/chat/completions` pattern
   - `[WorkerAI]`, `[OpenAI]`, `[Anthropic]`, `[Gemini]` prefixes appear with correct URLs
   - No more cross-request promise warnings (or significantly reduced)
   - Health checks pass (including AI domain)
   - HealthDiagnostician gracefully handles failures instead of crashing
5. Verify in browser:
   - Sidebar has hamburger toggle on all breakpoints
   - Sidebar collapses/expands correctly on mobile and desktop

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT CONSTRAINTS:
- Cloudflare Workers environment — NO Node.js APIs (no `fs`, `path`, `process`, etc.)
- Frontend: Astro + React with shadcn/ui (New York variant, dark theme), Tailwind CSS
- Do not modify Hono route structure or API endpoints
- Read every file listed before making changes
- Use console.log/console.error for logging (Workers runtime supports these)
- Use `@/ai/...` path aliases as defined in tsconfig.json
- NEVER manually construct AI Gateway URLs in individual provider files — always call AIGateway methods
- If AI_GATEWAY_TOKEN exists, ONLY send `cf-aig-authorization` header — never send standard `Authorization` alongside it
- Use Cloudflare compatibility pattern `/v1/chat/completions` for Workers AI and OpenAI-compatible requests
- Only append `?key={apiKey}` to Gemini URLs if apiKey is non-empty
```

---

## Antigravity Implementation Plan

### `.agent/workflows/implement-feature.md`
```markdown
# Workflow: Centralize AI Gateway Logic and Fix Provider Routing

## Criteria
- `ai/providers/ai-gateway.ts` is the sole source for Gateway resolution.
- URL endpoints must be correctly formatted as `.../v1/chat/completions`.
- BYOK mode must NOT send standard `Authorization` headers.
- Gemini provider must handle the `?key=` parameter conditionally.

## Steps
1. **Relocate and Refactor Gateway**:
    - Move `src/ai/utils/ai-gateway.ts` to `src/ai/providers/ai-gateway.ts`.
    - Apply fix: `return ${await gateway.getUrl('compat')}/v1/chat/completions;` for compatibility use cases.
    - Ensure `getBaseUrl` returns empty `apiKey` in BYOK mode.
2. **Clean config.ts**:
    - Delegate `normalizeProvider` to `AIGateway`.
    - Update `getAiGatewayUrl` to use `AIGateway.getBaseUrl`.
3. **Refactor Providers**:
    - Update `worker-ai.ts`: Use `AIGateway.createUniversalClient`.
    - Update `openai.ts`: Use `AIGateway.createUniversalClient`.
    - Update `anthropic.ts`: Standardize on `AIGateway` runner/client.
    - Update `gemini.ts`: Use `AIGateway.getBaseUrl` and fix conditional `?key=` appending.
4. **Validation**:
    - Verify `src/ai/providers/index.ts` connectivity.
    - Verify model normalization for `@cf/` models in all providers.
```

### `.agent/rules/ai-provider-standards.md`
```markdown
# AI Provider Implementation Standards

- **Centralized Logic**: NEVER manually construct AI Gateway URLs or Auth headers in individual provider files. Always call `AIGateway.getBaseUrl` or `AIGateway.createUniversalClient`.
- **BYOK Safety**: If an AI Gateway Token exists, only send the `cf-aig-authorization` header. The provider key is managed in the Cloudflare dashboard.
- **Endpoint Pattern**: Use the Cloudflare compatibility pattern `/v1/chat/completions` for Workers AI and OpenAI-compatible requests.
- **Gemini Param Safety**: Only append `?key={apiKey}` if `apiKey` is non-empty. Never send `?key=` with an empty string.
- **Path Aliases**: Always use `@/ai/...` or `@utils/...` for imports as defined in `tsconfig.json`.
```

---

## Critical Files Reference

| File | Role | Action |
|---|---|---|
| `src/ai/utils/ai-gateway.ts` | Current AIGateway class | MOVE to `src/ai/providers/ai-gateway.ts` |
| `src/ai/providers/ai-gateway.ts` | New centralized gateway (to create) | CREATE — single source of truth |
| `src/ai/providers/config.ts` | URL construction + normalization | REFACTOR — delegate to AIGateway |
| `src/ai/providers/worker-ai.ts` | Workers AI provider | UPDATE — fix compat URL |
| `src/ai/providers/openai.ts` | OpenAI provider | VERIFY — uses universal client |
| `src/ai/providers/anthropic.ts` | Anthropic provider | VERIFY — uses universal client |
| `src/ai/providers/gemini.ts` | Gemini provider | FIX — conditional `?key=` |
| `src/ai/providers/jules.ts` | Jules SDK provider | NO CHANGES |
| `src/ai/providers/index.ts` | Provider router + exports | UPDATE — imports + logging |
| `src/ai/gateway-health.ts` | Gateway health checks | ADD logging |
| `src/ai/health.ts` | AI domain health | VERIFY |
| `src/ai/utils/diagnostician.ts` | HealthDiagnostician | FIX — try/catch + logging |
| `src/backend/src/utils/hono.ts` | Shared Bindings + OpenAPIHono | KEEP — no changes |
| `src/frontend/src/layouts/RootLayout.tsx` | Sidebar integration | FIX — collapsible toggle |
| `src/frontend/src/components/layout/AppSidebar.tsx` | Sidebar component | FIX — single implementation |

## Verification Checklist

- [ ] `src/ai/providers/ai-gateway.ts` is the sole source for Gateway resolution
- [ ] URL endpoints correctly formatted as `.../v1/chat/completions`
- [ ] BYOK mode does NOT send standard `Authorization` headers
- [ ] Gemini handles `?key=` parameter conditionally (empty = omit)
- [ ] `config.ts` delegates normalization to `AIGateway`
- [ ] All providers import from `@/ai/providers/ai-gateway`
- [ ] Old `src/ai/utils/ai-gateway.ts` removed or re-exports
- [ ] `[ComponentName]` structured logging in all AI providers
- [ ] HealthDiagnostician has try/catch fallback for AI failures
- [ ] Cross-request promise warnings eliminated (Drizzle per-request)
- [ ] Sidebar: single implementation, hamburger toggle, all breakpoints
- [ ] `npx astro build` passes
- [ ] `pnpm run deploy` succeeds
- [ ] `wrangler tail` shows clean logs with correct gateway URLs
