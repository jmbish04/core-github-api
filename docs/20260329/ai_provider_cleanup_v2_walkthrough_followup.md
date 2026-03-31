# AI Provider Cleanup v2 — Follow-up Review

**Date:** 2026-03-29
**Reviewed against:** `main` branch after merge of walkthrough changes

---

## Overall Verdict

The merge was applied correctly. The core refactor — `resolveInvocation()`, cleaned-up callers, governance docs — is solid. There are a handful of gaps and improvements that should be addressed in a follow-up pass.

---

## Issues Found

### 1. VIOLATION: `services/appstore-ai.ts` imports directly from `@/ai/providers/gemini`

**Severity:** High — this is exactly the pattern the refactor was designed to eliminate.

```typescript
// Current (line 3):
import { generateStructuredResponse } from '@/ai/providers/gemini';

// Should be:
import { generateStructuredResponse } from '@/ai/providers';
```

Additionally, this file passes `zodToJsonSchema(AgentResponseSchema as any) as any` (a plain JSON schema object) to the function, but the unified `generateStructuredResponse` in `index.ts` expects `z.ZodType<T>`. The fix should pass the Zod schema directly:

```typescript
// Current:
const result = await generateStructuredResponse(
  env, prompt,
  zodToJsonSchema(AgentResponseSchema as any) as any,
  undefined,
  { model: "gemini-2.5-flash" }
);

// Should be:
const result = await generateStructuredResponse(
  env, prompt,
  AgentResponseSchema,
  undefined,
  { model: "gemini-2.5-flash" }
);
```

The `zodToJsonSchema` import can then be removed entirely.

---

### 2. `generateTextFromFiles` and `generateStructuredResponseFromFiles` do NOT use `resolveInvocation`

**Severity:** Medium — inconsistency with the rest of the router.

These two functions (lines 276-329) hardcode `const provider = providerOverride || 'gemini'` instead of calling `resolveInvocation(env, providerOverride, options?.model)`. This means:

- They ignore `AI_DEFAULT_PROVIDER` env var
- They don't respect `AIOptions.model` for provider inference
- Their default is `gemini` while every other function defaults to `worker-ai`

**Fix:**

```typescript
// generateTextFromFiles (line 284):
// Before:
const provider = providerOverride || 'gemini';
// After:
const { provider, model } = resolveInvocation(env, providerOverride, options?.model);
const finalOptions = { ...options, model };

// generateStructuredResponseFromFiles (line 312):
// Same fix
```

The `gemini` default for file operations may be intentional (Gemini handles multimodal better), but it should still go through `resolveInvocation` with a provider override to `'gemini'` if that's the desired behavior, so the model resolution is consistent.

---

### 3. `resolveInvocation` ignores `AI_DEFAULT_PROVIDER` env var

**Severity:** Medium — design concern.

When no overrides are given, `resolveInvocation` hardcodes `'worker-ai'` (line 120-121):

```typescript
if (!providerOverride && !modelOverride) {
  return { provider: 'worker-ai', model: resolveDefaultAiModel(env, 'worker-ai') };
}
```

But `resolveDefaultAiProvider(env)` reads `AI_DEFAULT_PROVIDER` / `AI_PROVIDER` from env and could return a different provider. This means setting `AI_DEFAULT_PROVIDER=gemini` in the environment has **no effect** on calls that go through `resolveInvocation` — they'll always default to `worker-ai`.

**Consider fixing to:**

```typescript
if (!providerOverride && !modelOverride) {
  const provider = resolveDefaultAiProvider(env);
  return { provider, model: resolveDefaultAiModel(env, provider) };
}
```

This would make the env var respected everywhere. The `resolveDefaultAiProvider` import is already present in `index.ts` (line 11) — currently unused, which is itself a code smell.

---

### 4. Unused import: `resolveDefaultAiProvider` in `index.ts`

**Severity:** Low — dead code.

Line 11 imports `resolveDefaultAiProvider` from `./ai-gateway/config` but it's only used in `verifyApiKey` (line 102). If issue #3 above is fixed (use it in `resolveInvocation`), this becomes used. If not, `verifyApiKey` should be the only consumer and the import is justified.

Actually — `verifyApiKey` does use it on line 102: `const provider = providerOverride || resolveDefaultAiProvider(env)`. So the import is NOT unused. But it's inconsistent that `verifyApiKey` respects `AI_DEFAULT_PROVIDER` while `resolveInvocation` does not.

---

### 5. `rewriteQuestionForMCP` bypasses the router, calls `jules.*` directly

**Severity:** Low — this is inside `index.ts` itself, so it's technically internal.

Line 381 calls `jules.generateStructuredResponse(...)` directly instead of going through the router:

```typescript
const result = await jules.generateStructuredResponse<{ rewritten_question: string }>(
  env, prompt, schema, systemPrompt, options
);
```

The comment says "Use Jules provider directly for repoless massive-context session". This is a valid design decision — it's intentionally hardwired to Jules. But it could be written as:

```typescript
const result = await generateStructuredResponse<{ rewritten_question: string }>(
  env, prompt, schema, systemPrompt, options, 'jules'
);
```

This keeps the routing consistent and would benefit from any future middleware (logging, metrics) added to the router.

---

### 6. `agent-ai.ts` exports are dead code — cleanup opportunity

**Severity:** Low — tech debt.

`src/backend/src/ai/agents/support/agent-ai.ts` (or `base/agent-ai.ts` depending on repo structure) still exports `resolveDefaultAiProvider`, `resolveDefaultAiModel`, `runTextAgent`, `streamTextAgent`. After this refactor, **zero external files** import from this module.

**Recommendation:** Either:
- Delete the file entirely, or
- Mark all exports `@deprecated` and add a `@internal` JSDoc tag, or
- At minimum, remove the resolver re-exports (`resolveDefaultAiProvider`, `resolveDefaultAiModel`) to prevent future regression

---

### 7. `streamTextAgent` streaming capability lost

**Severity:** Very Low — zero callers affected.

The old `planner.ts` used `streamTextAgent` for true token-by-token streaming. The refactored version calls `generateText` (full response), then writes the complete string to the Hono stream in one shot. This means the client no longer sees tokens arrive incrementally.

If streaming UX matters for the generate-description endpoint, a future `streamText` function should be added to `@/ai/providers`. No callers currently depend on this, so no immediate action needed.

---

### 8. `runWithOpenAIChat` and `runWithOpenAIAgent` have a redundant fallback

**Severity:** Very Low — cosmetic.

Lines 498 and 528 have `model || resolveDefaultAiModel(env, 'worker-ai')` as a fallback, but `resolveInvocation` already guarantees a model is set (it calls `resolveDefaultAiModel` in all branches). The `|| resolveDefaultAiModel(...)` fallback will never trigger. It's harmless but misleading.

---

## Summary Table

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | `appstore-ai.ts` imports from `@/ai/providers/gemini` | **High** | Fix: change to `@/ai/providers`, pass Zod schema directly |
| 2 | `generateTextFromFiles` / `generateStructuredResponseFromFiles` skip `resolveInvocation` | **Medium** | Fix: route through `resolveInvocation` |
| 3 | `resolveInvocation` ignores `AI_DEFAULT_PROVIDER` env var | **Medium** | Fix: call `resolveDefaultAiProvider(env)` in default branch |
| 4 | `resolveDefaultAiProvider` import appears unused (actually used by `verifyApiKey`) | **Low** | No action — becomes natural once #3 is fixed |
| 5 | `rewriteQuestionForMCP` calls `jules.*` directly | **Low** | Optional: route through `generateStructuredResponse(env, ..., 'jules')` |
| 6 | `agent-ai.ts` exports are dead code | **Low** | Cleanup: remove resolver re-exports or delete file |
| 7 | Streaming lost in `planner.ts` | **Very Low** | Future: add `streamText` to `@/ai/providers` |
| 8 | Redundant model fallback in OpenAI helpers | **Very Low** | Optional: remove dead fallback |

---

## Suggested Fix Prompt for Agent

Give this to your coding agent to address the high and medium issues:

---

### Task: AI Provider Refactor Follow-up Fixes

Fix the remaining issues from the AI provider centralization refactor. All changes should be on the current branch.

**Fix 1: `src/backend/src/services/appstore-ai.ts`**
- Change import from `'@/ai/providers/gemini'` to `'@/ai/providers'`
- Pass `AgentResponseSchema` (the Zod schema) directly to `generateStructuredResponse` instead of `zodToJsonSchema(AgentResponseSchema as any) as any`
- Remove the `zodToJsonSchema` dynamic import since it's no longer needed

**Fix 2: `src/backend/src/ai/providers/index.ts` — `generateTextFromFiles` and `generateStructuredResponseFromFiles`**
- Replace `const provider = providerOverride || 'gemini'` with `resolveInvocation(env, providerOverride || 'gemini', options?.model)` pattern
- Build `finalOptions` from resolved model, same as `generateText` does
- Pass `finalOptions` instead of `options` to the provider-specific calls

**Fix 3: `src/backend/src/ai/providers/index.ts` — `resolveInvocation` default case**
- Change the no-overrides branch from hardcoded `'worker-ai'` to `resolveDefaultAiProvider(env)`:
```typescript
if (!providerOverride && !modelOverride) {
  const provider = resolveDefaultAiProvider(env);
  return { provider, model: resolveDefaultAiModel(env, provider) };
}
```

**Verify:** Run `npx tsc --noEmit` and confirm 0 new errors. Run the audit greps from `.agent/workflows/audit-clean-ai-imports.md`.

---
