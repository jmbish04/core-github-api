# AI Providers Refactor Plan
> Saved: 2026-03-29 | Authoritative reference for this refactor and for future agents maintaining the AI providers layer.

## Context

The AI providers layer has accumulated maintenance-intensive patterns:
- Provider/model resolution is happening in callers (routes, services, automations) instead of being encapsulated in `ai/providers/index.ts`
- `ai/agents/base/agent-ai.ts` duplicates `resolveDefaultAiProvider`, `resolveDefaultAiModel`, and `runTextAgent` — all already covered by `ai/providers`
- API key retrieval is scattered across providers without a unified validation layer
- `namespacedModel` construction (e.g., `anthropic/${model}`) is inline-duplicated in every provider function
- `JULES_API_KEY` resolution is ad-hoc (direct `.get()` calls) in Jules service files
- Jules/Stitch business logic is scattered across `services/jules/`, `routes/api/jules/` (1,130 lines of route files with inline logic), `ai/agents/JulesOverseer.ts`, and automations
- `ai/agents/runtime/openai.ts` creates a circular dependency by wrapping `ai/providers` behind a compat shim that providers themselves import

The goal: centralize everything into `ai/providers/`, make callers dumb, add unified key validation with automatic fallback, and move Jules/Stitch into `ai/providers/jules/`.

---

## New Files

### 1. `backend/src/ai/providers/ai-gateway/normalize.ts`

Moves/consolidates model & provider normalization:

```ts
// normalizeProvider(str) → SupportedProvider  (moved from config.ts)
// normalizeModel(model)   → strips provider prefix if present
// namespacedModel(provider, model) → `${normalizeProvider(provider)}/${normalizeModel(model)}`
//   namespacedModel('anthropic', 'claude-3-5-sonnet-latest') → 'anthropic/claude-3-5-sonnet-latest'
//   namespacedModel('gemini', 'gemini-2.5-flash')            → 'google-ai-studio/gemini-2.5-flash'
//   Workers AI @cf/ models → returned as-is (no prefix)
//   Already-namespaced models → no double-prefix
```

`config.ts` keeps `normalizeProvider` as a re-export; internal provider files switch to normalize.ts.

### 2. `backend/src/ai/providers/ai-gateway/keys.ts`

Unified key retrieval + direct validation:

```ts
// DirectApiKeyValidator — pure fetch against provider metadata endpoints:
//   validateOpenAI(key)   → GET https://api.openai.com/v1/models
//   validateAnthropic(key)→ POST https://api.anthropic.com/v1/messages (1-token ping)
//   validateGemini(key)   → GET https://generativelanguage.googleapis.com/v1beta/models?key=...

// ProviderKey class:
//   constructor(provider: SupportedProvider, env: Env)
//   async get(): Promise<string | null>
//     - retrieves key from env binding or secret store
//     - logs: "[keys] <provider> key: FOUND | NOT FOUND"
//     - if FOUND → validates immediately with DirectApiKeyValidator
//     - logs: "[keys] <provider> key validation: VALID | INVALID (<status>)"
//     - returns key regardless (validation is informational; caller decides on failure)

// Named convenience wrappers:
//   getOpenAIKey(env), getAnthropicKey(env), getGeminiKey(env)

// getJulesKey(env): Promise<string | null>
//   typeof env.JULES_API_KEY === "string" ? env.JULES_API_KEY : await env.JULES_API_KEY?.get?.()
```

---

## Modified Files

### 3. Provider files: `anthropic.ts`, `openai.ts`, `gemini.ts`, `worker-ai.ts`

- Replace `getAnthropicApiKey(env)` etc. with named key getters from `ai-gateway/keys.ts`
- Replace all inline `namespacedModel` construction with `namespacedModel(provider, model)` from normalize.ts
- `verifyApiKey(env)` uses `ProviderKey.get()` (auto-validates)

### 4. `backend/src/ai/providers/index.ts`

Add **smart provider/model resolution** inside every generation function:

Resolution rules:
- No provider, no model → worker-ai (both resolved internally)
- Provider given, no model → `resolveDefaultAiModel(env, provider)`
- Model given, no provider → worker-ai (model ignored; resolve both as worker-ai)

**Key failure fallback**: HTTP 401/403 or key not found → fall back to worker-ai with `FallbackAlert`. Complements existing exception-based fallback.

### 5. `backend/src/ai/agents/base/agent-ai.ts`

- Remove duplicate `resolveDefaultAiProvider`/`resolveDefaultAiModel` — re-export from `@/ai/providers/config`
- Replace `runTextAgent` body with thin wrapper: `return generateText(options.env, options.input, options.instructions)`
- Remove `createRunner` (used in `standardization.ts`) — callers updated to `generateText` directly

---

## Jules Key Migration

Files to update from direct `.get()` to `getJulesKey(env)`:

| File | Current | After |
|------|---------|-------|
| `services/jules/service.ts:107` | `await this.env.JULES_API_KEY.get()` | `getJulesKey(this.env)` |
| `services/jules/jules.ts` | raw access | `getJulesKey(env)` |
| `services/github/workflow-templates.ts` | raw access | `getJulesKey(env)` |

---

## Caller Simplification

Remove `resolveDefaultAiProvider` + `resolveDefaultAiModel` + `runTextAgent` from all callers:

| File | Remove | Replace with |
|------|--------|-------------|
| `routes/api/frontend/projects/infrastructure.ts` | resolver imports + runTextAgent | `generateText(env, prompt, system)` |
| `routes/api/frontend/projects/planner.ts` | same | same |
| `services/landing-generator/service.ts` | same | same |
| `services/standardization.ts` | resolver imports + createRunner | `generateText(env, prompt, system)` |
| `services/todoInsights.ts` | resolver imports | `generateText(env, prompt, system)` |
| `automations/repository/standardization/rules.ts` | resolver imports | `generateText(env, prompt, system)` |
| `automations/issues/bug-hunter-workflow.ts` | agent-ai resolver imports | already imports generateStructuredResponse — just remove agent-ai |
| `ai/agents/SoftwareEngineer.ts` | agent-ai resolver imports | `generateStructuredResponse(this.env, ...)` |
| `ai/agents/ResearchOrchestrator.ts` | createRunner import | `generateText(this.env, ...)` |

Pattern: `runTextAgent({ env, provider, model, name, instructions, input })` → `generateText(env, input, instructions)`

---

## AI Agents Cleanup (`ai/agents/` + `base/`)

**Rule**: No file outside `ai/providers/` imports resolver functions, key getters, or agent-ai helpers alongside `ai/providers` imports.

### `ai/agents/base/BaseAgent.ts`
- `getProviderApiKey(provider)` → use `ProviderKey` from `ai-gateway/keys.ts`
- `resolveProvider()` / `resolveModel()` — keep as internal DO class methods; remove any external callers pre-resolving before passing

### `ai/agents/Reporting.ts` + `Judge.ts`
- Remove `resolveDefaultAiProvider`, `resolveDefaultAiModel` — call `this.runTextWithModel({ name, instructions, prompt })` with no provider/model

### `ai/agents/github/Repo.ts`
- Remove `resolveDefaultAiModel` — pass `model: undefined`

### `ai/agents/SoftwareEngineer.ts` + `ResearchOrchestrator.ts`
- See Caller Simplification table above

### `ai/agents/runtime/` (exists in `src/` — circular dependency, must fix)

**`runtime/openai.ts` — DELETE:**
- Creates circular dep: `ai/providers/openai.ts` imports from it, it imports from `ai/providers`
- Replace with direct `@openai/agents` imports (consistent with worktree versions)
- Superseded by `ai/providers/clients/openai/agent.ts`

**`runtime/agents.ts` — DELETE:**
- Only exports a no-op `callable` decorator
- `Orchestrator.ts`, `Repo.ts`, `Owner.ts` — remove `callable` imports/usages (no-ops)

**`runtime/workflows.ts` — KEEP:**
- Legitimate Cloudflare Workflow base class extension
- `workflows/research/orchestrator.ts` uses `AgentWorkflow` — valid

### `ai/agents/support/`
- Not found; apply dumb-invocation rule if it exists

---

## Jules-first Pattern for Analysis/Diagnostic Invocations

Code-heavy/log-heavy analysis tasks should use Jules first, fall back to `generateText(env, ...)` (no provider/model → worker-ai):

```ts
// BEFORE (anti-pattern):
const provider = resolveDefaultAiProvider(c.env);
const model = resolveDefaultAiModel(c.env, provider);
const analysis = await generateText(c.env, prompt, system, { model }, provider);

// AFTER:
import { analyzeLogs } from "@/ai/providers/jules";   // for log analysis
// OR:
import { generateText } from "@/ai/providers";
let analysis: string;
try {
  analysis = await analyzeLogs(c.env, logs, context);  // Jules-first
} catch {
  analysis = await generateText(c.env, prompt, system); // worker-ai fallback
}
```

Known candidates: `infrastructure.ts` (deployment analysis), `planner.ts` (project planning), `bug-hunter-workflow.ts` (bug analysis).

---

## Jules Centralization: `ai/providers/jules/`

### New Module Structure

```
backend/src/ai/providers/jules/
  index.ts      — public API (all exports)
  client.ts     — JulesService + JulesSessionBuilder (from services/jules/)
  sessions.ts   — session lifecycle + automatic D1 persistence
  stitch.ts     — StitchService + Jules+Stitch collaboration (from services/stitch/)
  webhook.ts    — webhook instruction builder (from services/jules/webhook-instruction.ts)
  types.ts      — all Jules/Stitch types
```

### `client.ts`
Consolidates `services/jules/service.ts` + `services/jules/builder.ts`. Uses `getJulesKey` from `ai-gateway/keys.ts`.

### `sessions.ts` — High-Level Methods (all auto-persist to D1)

```ts
startSession(env, params)           → { sessionId, jobId }
runRepoless(env, prompt, options?)  → result string
runAdvancedSession(env, params)     → { sessionId, streamUrl, instruction }
analyzeLogs(env, logs, context?)    → string (Jules-first, generateText fallback)
sendMessage(env, sessionId, msg)    → void
getSession(env, sessionId)          → session
getSessionStatus(env, sessionId)    → status + snapshot
streamSession(env, sessionId)       → ReadableStream (SSE)
approveSession(env, sessionId)      → void
mergePr(env, sessionId)             → merge result
resolveConflicts(env, params)       → resolution result
runWithGoogleDocs(env, params)      → sessionId
runWithGoogleSheets(env, params)    → sessionId
runWithMcpPlan(env, params)         → sessionId
runWithCustomCli(env, params)       → sessionId
runWithCustomMcpServer(env, params) → sessionId
```

### `stitch.ts`
Move `services/stitch/service.ts` here. Add:
```ts
runStitchCollaboration(env, params) → { julesSessionId, stitchResult }
```

### Route Files (`routes/api/jules/`) — All 12 slim down

All inline `JulesSessionBuilder`, `JulesService`, D1 queries → extracted to `ai/providers/jules/sessions.ts`. Route files become thin handlers (~5-10 lines each):

```ts
// routes/api/jules/advanced.ts
import { runAdvancedSession } from "@/ai/providers/jules";
app.post("/", zValidator("json", schema), async (c) => {
  const result = await runAdvancedSession(c.env, c.req.valid("json"));
  return c.json(result);
});
```

### `ai/agents/JulesOverseer.ts`
Update import: `@services/jules` → `@/ai/providers/jules`. DO stays in `ai/agents/`.

### `services/jules/` + `services/stitch/` — Deprecate
Re-export from `@/ai/providers/jules` for backward compat. Mark all service files `@deprecated`.

### Callers updating to `@/ai/providers/jules`
- `automations/push/JulesStandardsPush.ts`
- `automations/push/commands/standardize.ts`
- `automations/issues/JulesAutoFix.ts`
- `routes/api/frontend/projects/actions.ts`
- `routes/api/agents/jules.ts` (legacy)

### D1 Tables (auto-handled in `sessions.ts`)
- `jules_sessions` + `julesJobs` — persisted inside every session method
- `julesWebhookEvents` — handled in webhook route, not in provider

---

## Governance: Agent Rules, Skills, Workflows & Docstrings

### Update `AGENTS.md`

Add **AI Provider Rules — MANDATORY** section:

```markdown
## AI Provider Rules — MANDATORY

> See: `.agent/rules/ai-providers.md`, `.agent/skills/maintain-ai-providers/SKILL.md`,
> `.agent/skills/maintain-ai-agents/SKILL.md`, `.agent/workflows/audit-clean-ai-imports.md`

All AI generation MUST go through `@/ai/providers`. Callers pass `env` only:

✅ `const result = await generateText(env, prompt, systemPrompt);`
❌ `const provider = resolveDefaultAiProvider(env); ... generateText(env, ..., provider)`
❌ Import from `@/ai/providers/openai` directly
❌ Import from `@/ai/agents/base/agent-ai` for runTextAgent
❌ Import from `@/ai/providers/ai-gateway/*` outside of ai/providers/ files

For code/log analysis: use `analyzeLogs` or Jules methods from `@/ai/providers/jules` first,
fall back to `generateText(env, prompt, system)` (worker-ai default).
```

### Update `.agent/rules/ai-providers.md`

- Remove: "specify the `provider` and `model` arguments when known" (callers should NOT do this)
- Add: clean invocation rule, ai-gateway access prohibition, Jules-first pattern, ProviderKey mandate

### New: `.agent/workflows/audit-clean-ai-imports.md`

Grep commands to audit violations:
```bash
grep -rn "resolveDefaultAiModel\|resolveDefaultAiProvider" backend/src --include="*.ts" --exclude-dir="ai/providers"
grep -rn "from.*agent-ai" backend/src --include="*.ts"
grep -rn "JULES_API_KEY" backend/src --include="*.ts" --exclude="ai/providers/ai-gateway/keys.ts"
grep -rn 'from.*ai-gateway' backend/src --include="*.ts" --exclude-dir="ai/providers"
```

Violation types: A=external resolver, B=agent-ai import, C=raw JULES_API_KEY, D=direct ai-gateway import.

### New: `.agent/skills/maintain-ai-providers/SKILL.md`

3-layer architecture: `ai-gateway/` (internal) → provider files → `index.ts` (public). Clean invocation contract, ProviderKey, namespacedModel, fallback chain, Jules-first pattern, module docstring requirements.

### New: `.agent/skills/maintain-ai-agents/SKILL.md`

Dual-mode environment: Hono DO agents (`BaseAgent` subclasses) use `this.runTextWithModel`; direct callers use `generateText(env, ...)`. OpenAI Chat/Agents SDK is internal to provider files only.

### Docstrings on all `ai/providers/` and `ai/providers/ai-gateway/` modules

Every file must have a top-level JSDoc with: what it does, who may import it, access restrictions. Examples:

- `ai-gateway/keys.ts`: "INTERNAL to ai/providers/. External imports FORBIDDEN unless adding a new provider file or user has approved."
- `ai-gateway/normalize.ts`: "INTERNAL to ai/providers/. Use `namespacedModel()` inside provider files only."
- `ai/providers/index.ts`: "The single public interface for all AI generation. Handles provider, model, key, and fallback internally. Callers MUST NOT import resolveDefault*, ProviderKey, or any ai-gateway submodule."
- `ai/providers/jules/index.ts`: "The single public interface for all Jules/Stitch operations. Routes, automations, and agents import from here only."

---

## Note on `structured-chat.ts`

Not found in this worktree. If it exists in main, delete it — any "structured chat" wrapper is duplicative of `generateStructuredResponse` from `@/ai/providers`.

---

## Verification

1. **Key validation logging**: Valid key → `FOUND` + `VALID`. Invalid key → `FOUND` + `INVALID`.
2. **Worker-AI fallback**: Set `AI_DEFAULT_PROVIDER=anthropic`, clear `ANTHROPIC_API_KEY` → `FallbackAlert` logged, request succeeds via worker-ai.
3. **Caller simplicity**: `infrastructure.ts` and `planner.ts` no longer import from `agent-ai`. AI responses unchanged.
4. **Jules key**: `JulesService.getClient()` uses `getJulesKey` with logging.
5. **namespacedModel**: No double-prefix on already-namespaced models. `@cf/` models unchanged.
6. **Jules routes**: POST `/api/jules/start`, `/api/jules/advanced` work correctly. Sessions appear in `jules_sessions` D1 table.
7. **Import audit**: All audit grep commands return zero violations.
8. **runtime/ circular dep resolved**: `ai/providers/openai.ts` and `anthropic.ts` import `Agent, tool` from `@openai/agents` directly.



---

