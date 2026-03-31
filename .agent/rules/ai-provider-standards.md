# AI Provider Standards

## URL Construction (CRITICAL)

**NEVER** manually construct AI Gateway URLs or append endpoint paths. Use `AIGateway.getBaseUrl()` with the `endpoint` option — it returns the **full URL** ready for `fetch()`.

```typescript
// ✅ CORRECT — endpoint specified, baseUrl is the complete URL
const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'openai', endpoint: 'chat' });
const res = await fetch(baseUrl, { ... });

// ✅ CORRECT — raw base for Gemini's custom native path
const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'gemini' });
const res = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, { ... });

// ❌ FORBIDDEN — manual path appending defeats centralization
const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'openai' });
const res = await fetch(`${baseUrl}/v1/chat/completions`, { ... });
```

### Endpoint Options
- `endpoint: 'chat'` → appends `/v1/chat/completions`
- `endpoint: 'models'` → appends `/v1/models`
- No endpoint → raw gateway URL (for Gemini native path only)

## Authentication

- **BYOK Mode** (`AI_GATEWAY_TOKEN` set): Only send `cf-aig-authorization: Bearer {token}`. Do NOT send `Authorization` header — the gateway injects stored provider keys.
- **Direct Mode** (`AI_GATEWAY_TOKEN` absent): Send `Authorization: Bearer {apiKey}` as usual.

## Imports

- **Canonical**: `import { AIGateway } from '@/ai/providers/ai-gateway'`
- **Legacy re-export**: `@/ai/utils/ai-gateway` still works but is deprecated

## Logging

All AI providers MUST use the `Logger` class from `src/lib/logger.ts` (NOT raw `console.log`/`console.error`).

> See `.agent/rules/traceability-logging.md` for full enforcement rules.

Standard source overrides:

| Provider | Source Override |
|----------|----------------|
| AI Gateway | `'AIGateway'` |
| Workers AI | `'WorkerAI'` |
| OpenAI | `'OpenAI'` |
| Anthropic | `'Anthropic'` |
| Gemini | `'Gemini'` |
| Router | `'AIRouter'` |
| Health | `'GatewayHealth'` |
| Diagnostician | `'Diagnostician'` |

## Provider Files

| Provider | File | Status |
|----------|------|--------|
| Gateway | `src/ai/providers/ai-gateway.ts` | Source of truth |
| Config | `src/ai/providers/config.ts` | Model resolution only — NO gateway URLs |
| Workers AI | `src/ai/providers/worker-ai.ts` | Uses gateway client |
| OpenAI | `src/ai/providers/openai.ts` | Uses gateway client |
| Anthropic | `src/ai/providers/anthropic.ts` | Uses gateway client |
| Gemini | `src/ai/providers/gemini.ts` | Uses native client via `getBaseUrl()` |
