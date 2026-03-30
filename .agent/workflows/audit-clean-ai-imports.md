---
description: Audit codebase for clean AI provider imports
---

# Audit: Clean AI Provider Imports

Run these checks to verify all AI generation goes through `@/ai/providers`.

// turbo-all

## Steps

1. Check for resolver imports in external code:
```bash
grep -rn 'resolveDefaultAiProvider\|resolveDefaultAiModel' \
  src/backend/src/routes/ src/backend/src/services/ \
  src/backend/src/automations/ src/backend/src/workflows/ \
  --include="*.ts"
```
Expected: empty output (0 matches).

2. Check for agent-ai imports in external code:
```bash
grep -rn 'from.*@/ai/agents/support/agent-ai' \
  src/backend/src/routes/ src/backend/src/services/ \
  src/backend/src/automations/ src/backend/src/workflows/ \
  --include="*.ts"
```
Expected: empty output (0 matches).

3. Check for direct AIGateway usage in external code:
```bash
grep -rn 'AIGateway\.runText\|AIGateway\.runStructured' \
  src/backend/src/routes/ src/backend/src/services/ \
  src/backend/src/automations/ src/backend/src/workflows/ \
  --include="*.ts"
```
Expected: empty output (0 matches).

4. Check for direct provider file imports in external code:
```bash
grep -rn 'from.*@/ai/providers/openai\|from.*@/ai/providers/gemini\|from.*@/ai/providers/anthropic\|from.*@/ai/providers/worker-ai' \
  src/backend/src/routes/ src/backend/src/services/ \
  src/backend/src/automations/ src/backend/src/workflows/ \
  --include="*.ts"
```
Expected: empty output (0 matches).

5. TypeScript compilation check:
```bash
pnpm run check
```
Expected: 0 errors.

## Allowed Exceptions

- `ai/agents/support/inference.ts` — internal agent helpers
- `ai/agents/support/agent-ai.ts` — legacy compat layer
- `ai/agents/runtime/openai.ts` — Agent SDK compat shim
- `routes/api/agents/models.ts` — needs `resolveDefaultAiModel` for defaults display
