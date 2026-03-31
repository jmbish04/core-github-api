# AI Provider Cleanup v2 — Error Resolution Plan

**Date:** 2026-03-29
**Scope:** All TypeScript and ESLint errors reported across main repo and worktrees

---

## Error Triage

The 26 reported errors break down into **4 categories**:

| Category | Count | Severity | Where |
|----------|-------|----------|-------|
| Worktree missing `node_modules` | 8 | Noise — not real | 4 worktrees × 2 errors each |
| ESLint unused vars / empty blocks | 12 | Low — warnings + 1 error-level | Backend + Frontend |
| TypeScript type mismatch | 1 | Medium | Frontend `ResearchDetail.tsx` |
| ESLint stale directive + missing dep | 2 | Low | Frontend `ResearchDetail.tsx` |
| Refactor leftover (unused import) | 1 | Low | Backend `discord.ts` |

---

## Category 1: Worktree `tsconfig.app.json` — Missing Type Definitions (8 errors)

**Files:** `tsconfig.app.json` in worktrees `ai-providers-refactor`, `eager-wilson`, `jovial-brown`, `reverent-visvesvaraya`

**Error:** `Cannot find type definition file for 'astro/client'` and `'vite/client'`

**Root Cause:** Worktrees don't have their own `node_modules` under `src/frontend/`. The main repo's `src/frontend/node_modules/` has `astro` and `vite` installed, but worktrees created via `git worktree` share the git objects but NOT `node_modules`. VS Code opens these `tsconfig.app.json` files and reports errors because the packages aren't there.

**Fix:** Run `npm install` (or `pnpm install`) inside each worktree's `src/frontend/` directory. Or — since these are temporary worktrees — simply **clean up stale worktrees** that are no longer needed:

```bash
# From repo root
git worktree list

# Remove stale worktrees (keep ai-providers-refactor if still active)
git worktree remove .claude/worktrees/eager-wilson
git worktree remove .claude/worktrees/jovial-brown
git worktree remove .claude/worktrees/reverent-visvesvaraya
```

**Recommendation:** Remove all stale worktrees. For `ai-providers-refactor`, either merge and remove, or run `cd src/frontend && npm install` inside it. These errors are **VS Code noise** — they don't affect the main repo build.

---

## Category 2: Refactor Leftover — `discord.ts` Unused Import (1 error)

**File:** `src/backend/src/workflows/research/discord.ts` line 5

**Error:** `'zodToJsonSchema' is defined but never used.`

**Root Cause:** This was part of our AI provider refactor. When we switched from `AIGateway.runStructuredResponseWithModelFallback` (which needed JSON schema) to `generateStructuredResponse` from `@/ai/providers` (which accepts Zod schema directly), the `zodToJsonSchema` import became unused but wasn't cleaned up.

**Fix:**

```typescript
// Line 5 — DELETE this line:
import { zodToJsonSchema } from 'zod-to-json-schema';
```

---

## Category 3: TypeScript Type Mismatch — Button `size="xs"` (1 error)

**File:** `src/frontend/src/views/research/ResearchDetail.tsx` line 189

**Error:** `Type '"xs"' is not assignable to type '"default" | "sm" | "lg" | "icon" | null | undefined'.`

**Root Cause:** The `Button` component from `@/components/ui/button.tsx` defines size variants as `default | sm | lg | icon`. There is no `xs` variant. The code uses `<Button size="xs" ...>`.

**Fix — Option A (change usage to `sm`):**
```tsx
// Line 189 — change:
<Button size="xs" variant="outline" onClick={() => handleApprove(candidate.id)}>
// to:
<Button size="sm" variant="outline" onClick={() => handleApprove(candidate.id)}>
```

**Fix — Option B (add `xs` variant to Button):**
```tsx
// In src/frontend/src/components/ui/button.tsx, add to size variants:
size: {
  default: "h-9 px-4 py-2",
  xs: "h-6 rounded px-2 text-xs",   // <-- ADD
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8",
  icon: "h-9 w-9",
},
```

**Recommendation:** Option B — the `xs` size was likely intentional for a compact inline approve button. Add it to the design system.

---

## Category 4: ESLint Warnings in `one-time.ts` (4 errors)

**File:** `src/backend/src/routes/api/frontend/research/one-time.ts`

### 4a. Empty block statement (line 363) — error severity

```typescript
// Current:
} catch(e) {}

// Fix — add comment explaining intentional suppression:
} catch {
  // SHA lookup failure is expected for new files — proceed without sha
}
```

### 4b. Unused destructured vars (line 48) — warning severity

```typescript
// Current:
const { id: _id, createdAt, updatedAt, ...updateData } = body;

// Fix — prefix all unused with underscore:
const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...updateData } = body;
```

### 4c. Unused `e` in catch (line 363) — warning severity

Fixed by 4a above (remove the `e` parameter entirely).

---

## Category 5: Frontend ESLint — Unused Vars (7 errors)

### 5a. `ProjectEditorConfig.tsx` line 17 — 4 unused props (error severity)

**Error:** `cronPrompt`, `setCronPrompt`, `handleGenerateCron`, `generatingCron` are defined but never used.

**Root Cause:** These props are passed in from the parent but the cron generation UI hasn't been built yet in this component (or was removed).

**Fix — Option A (remove from destructuring if truly unused):**
```tsx
export function ProjectEditorConfig({
  formData, handleChange, distinctTerms,
  // cronPrompt, setCronPrompt, handleGenerateCron, generatingCron, // removed
  availableDiscordChannels, selectedSource, setSelectedSource, ...
```

Also remove from the `ProjectEditorConfigProps` type if it exists.

**Fix — Option B (prefix with underscore):**
```tsx
export function ProjectEditorConfig({
  formData, handleChange, distinctTerms,
  cronPrompt: _cronPrompt, setCronPrompt: _setCronPrompt,
  handleGenerateCron: _handleGenerateCron, generatingCron: _generatingCron,
  ...
```

**Recommendation:** Option B for now (preserves the interface contract). These props are likely planned for future use.

### 5b. `ProjectEditorReview.tsx` line 3 — unused `ArrowLeft` import

```tsx
// Change:
import { ArrowLeft, Play, Globe, CheckCircle2 } from 'lucide-react';
// To:
import { Play, Globe, CheckCircle2 } from 'lucide-react';
```

### 5c. `ProjectEditorValidation.tsx` line 3 — unused `Loader2` import

```tsx
// Change:
import { Loader2, ArrowLeft, ArrowRight, Github, MessageSquare, CloudLightning, Info } from 'lucide-react';
// To:
import { ArrowLeft, ArrowRight, Github, MessageSquare, CloudLightning, Info } from 'lucide-react';
```

### 5d. `ProjectEditor.tsx` line 10 — unused `onBack` prop

```tsx
// Current:
export default function ProjectEditor({ projectId, onBack, onLaunch }: ...

// Fix:
export default function ProjectEditor({ projectId, onBack: _onBack, onLaunch }: ...
// OR remove if the parent doesn't pass it
```

---

## Category 6: `ResearchDetail.tsx` ESLint (2 warnings)

### 6a. Unused eslint-disable directive (line 79)

```tsx
// Line 79 — DELETE this line:
// eslint-disable-next-line react-hooks/exhaustive-deps
```

The directive is stale — the next `useEffect` on line 80 no longer triggers the rule it was suppressing.

### 6b. Missing dependency in useEffect (line 84)

```tsx
// Current:
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 3000);
  return () => clearInterval(interval);
}, [id]);

// Fix — wrap fetchData in useCallback or include it:
const fetchData = useCallback(async () => {
  // ... existing fetchData body
}, [id]);

useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 3000);
  return () => clearInterval(interval);
}, [fetchData]);
```

**Note:** This needs care — check that `fetchData` doesn't reference other state that would cause infinite re-renders when added to deps. The `useCallback` with `[id]` deps is the safest approach.

---

## Category 7: Backend ESLint Warnings (2 warnings)

### 7a. `Research.ts` line 217 — unused `e` in catch

```typescript
// Change:
} catch(e) {
// To:
} catch {
```

### 7b. `daily/trends.ts` line 8 — unused `DailyTrendSchema`

Check if `DailyTrendSchema` is used elsewhere in the file (e.g., in route validation or OpenAPI spec). If truly unused:

```typescript
// Either delete the schema definition entirely, or prefix:
const _DailyTrendSchema = z.object({ ... });
```

**More likely:** This schema was defined for OpenAPI documentation or future route validation. If the file uses `@hono/zod-openapi`, the schema may be needed in a route definition that hasn't been wired up yet. Prefix with underscore for now.

---

## Execution Order

Priority order for fixes:

| Step | What | Impact | Files |
|------|------|--------|-------|
| 1 | Remove stale worktrees | Eliminates 8 errors | Shell commands only |
| 2 | Remove `zodToJsonSchema` unused import from `discord.ts` | Refactor cleanup | 1 file |
| 3 | Add `xs` size variant to Button component | Fixes TS error | 1 file |
| 4 | Fix `one-time.ts` empty catch + unused vars | Fixes 4 ESLint errors | 1 file |
| 5 | Fix frontend unused imports/vars | Fixes 7 ESLint errors | 5 files |
| 6 | Fix `ResearchDetail.tsx` stale directive + useEffect deps | Fixes 2 warnings | 1 file |
| 7 | Fix backend `Research.ts` + `trends.ts` unused vars | Fixes 2 warnings | 2 files |

**Total: 11 files touched, 26 errors resolved.**

---

## Agent Prompt

Give this to your coding agent:

---

### Task: Fix All Reported TypeScript and ESLint Errors

Fix all errors listed below. Do NOT modify any logic — only fix types, imports, and lint issues.

**1. Remove unused import in `src/backend/src/workflows/research/discord.ts`:**
- Delete line 5: `import { zodToJsonSchema } from 'zod-to-json-schema';`

**2. Add `xs` size variant to `src/frontend/src/components/ui/button.tsx`:**
- In the `size` variants object, add: `xs: "h-6 rounded px-2 text-xs",` before the `sm` entry

**3. Fix `src/backend/src/routes/api/frontend/research/one-time.ts`:**
- Line 48: Change `const { id: _id, createdAt, updatedAt, ...updateData } = body;` to `const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...updateData } = body;`
- Line 363: Change `} catch(e) {}` to `} catch { /* sha lookup may fail for new files */ }`

**4. Fix `src/frontend/src/views/research/components/editor/ProjectEditorConfig.tsx`:**
- Line 17: Prefix the 4 unused props with underscore: `cronPrompt: _cronPrompt, setCronPrompt: _setCronPrompt, handleGenerateCron: _handleGenerateCron, generatingCron: _generatingCron`

**5. Fix `src/frontend/src/views/research/components/editor/ProjectEditorReview.tsx`:**
- Line 3: Remove `ArrowLeft` from the lucide-react import

**6. Fix `src/frontend/src/views/research/components/editor/ProjectEditorValidation.tsx`:**
- Line 3: Remove `Loader2` from the lucide-react import

**7. Fix `src/frontend/src/views/research/components/ProjectEditor.tsx`:**
- Line 10: Change `onBack` to `onBack: _onBack` in destructuring

**8. Fix `src/frontend/src/views/research/ResearchDetail.tsx`:**
- Line 79: Delete the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment
- Wrap `fetchData` in `useCallback` with `[id]` deps, then change the useEffect deps on line 84 from `[id]` to `[fetchData]`

**9. Fix `src/backend/src/ai/agents/Research.ts`:**
- Line 217: Change `} catch(e) {` to `} catch {`

**10. Fix `src/backend/src/routes/api/frontend/research/daily/trends.ts`:**
- Line 8: Prefix with underscore: `const _DailyTrendSchema = z.object({`

**11. Clean up stale worktrees** (run from repo root):
```bash
git worktree remove .claude/worktrees/eager-wilson 2>/dev/null
git worktree remove .claude/worktrees/jovial-brown 2>/dev/null
git worktree remove .claude/worktrees/reverent-visvesvaraya 2>/dev/null
```

**Verify:** Run `npx eslint src/backend/src/workflows/research/discord.ts src/backend/src/routes/api/frontend/research/one-time.ts src/backend/src/ai/agents/Research.ts src/backend/src/routes/api/frontend/research/daily/trends.ts` and `npx tsc --noEmit -p src/frontend/tsconfig.app.json` to confirm 0 errors.

---
