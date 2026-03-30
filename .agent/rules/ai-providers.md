# Protocol: AI Provider Routing & Resolution

**`@/ai/providers/index.ts`** is the **single public API** for all AI generation.

## Mandatory Import Path

Callers must _always and exclusively_ import AI functions from `@/ai/providers`:

```typescript
// ✅ CORRECT
import { generateText, generateStructuredResponse } from "@/ai/providers";
const result = await generateText(env, prompt, system);

// ❌ FORBIDDEN — pre-resolving provider/model
import { resolveDefaultAiProvider, resolveDefaultAiModel } from "@/ai/agents/support/agent-ai";
const provider = resolveDefaultAiProvider(env);
const model = resolveDefaultAiModel(env, provider);
const result = await AIGateway.runTextWithFallback(env, provider, model, system, prompt);

// ❌ FORBIDDEN — direct provider imports
import { generateText } from "@/ai/providers/openai";

// ❌ FORBIDDEN — config imports in external code
import { resolveDefaultAiModel } from "@/ai/providers/ai-gateway/config";
```

## Resolution Behavior

- If **no provider or model** is passed, the system defaults to `worker-ai` via `resolveInvocation()`.
- If a **provider** is specified but no model, the default model for that provider is resolved internally.
- If a **model** is specified via `AIOptions.model`, it is passed through; provider defaults to `worker-ai`.

## Forbidden Imports (External Code)

External code (routes, services, automations, workflows) must **NEVER** import:

1. `resolveDefaultAiProvider` or `resolveDefaultAiModel` from anywhere
2. `AIGateway` class directly
3. Individual provider modules (`@/ai/providers/openai`, `@/ai/providers/gemini`, etc.)
4. `@/ai/providers/ai-gateway/config`

## Allowed Exceptions

These files are **internal** to the AI subsystem and may import resolvers:

- `ai/agents/support/inference.ts` — internal agent helpers
- `ai/agents/support/agent-ai.ts` — legacy compat layer
- `ai/agents/runtime/openai.ts` — Agent SDK compat shim
- `routes/api/agents/models.ts` — model listing endpoint (needs `resolveDefaultAiModel` for defaults display)
