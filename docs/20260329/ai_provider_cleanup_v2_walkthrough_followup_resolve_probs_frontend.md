# Frontend & Backend Lint Error Resolution Plan (Post-Agent Run)

**Date:** 2026-03-29
**Source:** Live `eslint .` run from `src/frontend/` + backend spot checks
**Current total:** 187 frontend problems (171 errors, 16 warnings) + 2 backend warnings

---

## What the Agent Already Fixed (15 problems eliminated)

- `src/frontend/src/views/research/components/ProjectEditor.tsx` — unused `onBack` ✅
- `src/frontend/src/views/research/components/editor/ProjectEditorConfig.tsx` — 4 unused cron props ✅
- `src/frontend/src/views/research/components/editor/ProjectEditorReview.tsx` — unused `ArrowLeft` ✅
- `src/frontend/src/views/research/components/editor/ProjectEditorValidation.tsx` — unused `Loader2` ✅
- `src/frontend/src/views/repos/Projects.tsx` — unused `overview` + `tasks`/`phases` deps ✅
- `src/backend/src/workflows/research/discord.ts` — unused `zodToJsonSchema` ✅

## What Still Remains

| Rule | Count | Type |
|------|-------|------|
| `@typescript-eslint/no-unused-vars` | 118 | error |
| `react-refresh/only-export-components` | 27 | error |
| `react-hooks/exhaustive-deps` | 14 | warning |
| `react-hooks/refs` (ref during render) | 9 | error |
| `react-hooks/set-state-in-effect` | 7 | error |
| `no-empty` (empty catch blocks) | 2 | error |
| `@typescript-eslint/no-empty-object-type` | 2 | error |
| `react-hooks/immutability` (access before declare) | 2 | error |
| `react-hooks/purity` (impure render) | 2 | error |
| `require-yield` | 1 | error |
| `prefer-const` | 1 | error |
| `@typescript-eslint/ban-ts-comment` | 1 | error |
| `react-hooks/use-memo` (throttle in useCallback) | 1 | error |
| `react-hooks/incompatible-library` | 1 | warning |
| Stale eslint-disable directive | 1 | warning |
| **Backend: `@typescript-eslint/no-unused-vars`** | **2** | warning |

---

## Phase 1 — Unused Imports & Variables (118 errors + 2 backend warnings)

**Risk:** None. Pure dead-code removal.

### Rules:
- Unused imports → delete from import statement
- Unused function params (`e`, `err`, `data`, `reject`) → prefix with `_`
- Unused assigned vars (`const x = ...`) → prefix with `_`
- Unused destructured vars → prefix with `_` (e.g., `{ foo: _foo, ...rest }`)

### Files (frontend):

| File | What to fix |
|------|------------|
| `AgentWorkflowTimeline.tsx` L1,L3,L29 | Remove `useEffect`, `useState`, `TimelineStep`; prefix `data` → `_data` |
| `LiveOpsConsole.tsx` L10,L32 | Remove `RotateCcw`; prefix `lastMessage` → `_lastMessage`, `isConnected` → `_isConnected` |
| `RecentTasksCard.tsx` L7 | Remove `cn` |
| `assistant-ui/shiki-highlighter.tsx` L37-38 | Already prefixed `_node`, `_components` — check eslint config recognizes `_` prefix |
| `assistant-ui/sources.tsx` L75 | Prefix `asChild` → `_asChild` |
| `CFCommandCenterNav.tsx` L15 | Remove `Activity` |
| `PromptDraftModal.tsx` L17 | Remove `useRef` |
| `SystemPromptModal.tsx` L23 | Remove `ExternalLink` |
| `useCFDocsRuntime.ts` L21,L76,L84,L173 | Remove `updateThread`; prefix `e` → `_e`, `userMsg` → `_userMsg`, `err` → `_err` |
| `CloudflareWorkerCosts.tsx` L6 | Remove `Badge` |
| `ConfigTable.tsx` L19,L70,L88-89 | Remove `Eye`, `EyeOff`; prefix `toggleSecret` → `_toggleSecret`, `isSecret` → `_isSecret`, `isRevealed` → `_isRevealed` |
| `Header.tsx` L2,L5 | Remove `Separator`, `Save` |
| `kibo-ui/gantt/index.tsx` L113 | Prefix `_date` (verify) |
| `kibo-ui/tags/index.tsx` L204 | Prefix `className` → `_className` |
| `kibo-ui/tree/index.tsx` L191 | Prefix `onClick` → `_onClick` |
| `LandingPageGenerator.tsx` L8 | Remove `cn` |
| `KanbanView.tsx` L1-8 | Remove `useState`, `useEffect`, `DragOverlay`, `SortableContext`, `verticalListSortingStrategy`, `CardTitle`, `CardContent`, `Bot`, `User`, `Avatar`, `AvatarFallback` |
| `ProjectsTab.tsx` L5 | Remove `CardHeader`, `CardTitle`, `CardDescription` |
| `LandingGeneratorModal.tsx` L26,L29 | Remove `Input`, `Badge` |
| `NewProjectDialog.tsx` L6,L7 | Remove `DialogFooter`, `FormDescription` |
| `useDeepResearchRuntime.ts` L8 | Remove `AssistantRuntimeProvider` |
| `AgentFactoryTool.tsx` L12-20,L405 | Remove `ScrollArea`, `Badge`, `Send`, `Square`, `Wrench`, `Code2`, `Zap`, `BookOpen`, `MicIcon`; prefix `SESSION_PREFIX` → `_SESSION_PREFIX` |
| `CloudflareDocsTool.tsx` L10,L11,L25,L315 | Remove `Code2`, `Search`, `Suggestions`; prefix `event` → `_event` |
| `RegistryDirectory.tsx` L206 | Prefix `index` → `_index` |
| `CloudflareDocsBetaPage.tsx` L31,L210 | Remove `Suggestions`; prefix `start` → `_start` |
| `CloudflareDocsPage.tsx` L2-9,L24,L334,L342,L786 | Remove `useNavigate`, `Send`, `Package2`, `Globe`, `Activity`, `Square`, `Settings`, `MicIcon`, `SquareIcon`, `TabsList`, `TabsTrigger`; prefix `_event` (already), `err` → `_err`, `paramMatch` → `_paramMatch` |
| `LiveEventsTab.tsx` L19 | Prefix `queryClient` → `_queryClient` |
| `WorkflowRunsTab.tsx` L4,L7,L54 | Remove `CheckCircle2`, `XCircle`, `AlertCircle`, `CardDescription`; prefix `loading` → `_loading` |
| `data.tsx` (workflows) L1 | Remove `FiFileText`, `FiAlertCircle` |
| `ConflictResolver.tsx` L24,L51 | Prefix both `e` → `_e` |
| `ConsultationSplitPane.tsx` L3 | Remove `Blocks`, `CheckCircle2` |
| `DecisionInbox.tsx` L3,L26,L45 | Remove `CardContent`; prefix both `err` → `_err` |
| `DeploymentAnimation.tsx` L10 | *(This is `prefer-const` — see Phase 1b)* |
| `DiffViewer.tsx` L6 | Prefix `taskEventId` → `_taskEventId` |
| `LiveTerminal.tsx` L21 | Prefix `e` → `_e` |
| `MemoryExplorer.tsx` L22 | Prefix `e` → `_e` |
| `MillerMarketplace.tsx` L23 | Prefix `e` → `_e` |
| `ReviewSummary.tsx` L23,L45 | Prefix both `err` → `_err` |
| `SessionTimeline.tsx` L65 | Prefix `i` → `_i` |
| `auth-context.tsx` L5 | Prefix `COOKIE_EXPIRES_DAYS` → `_COOKIE_EXPIRES_DAYS` |
| `useHoniChatRuntime.ts` L5-6,L11,L53 | Remove `ThreadMessage`, `useCallback`; prefix `isRunning` → `_isRunning`, `reject` → `_reject` |
| `diceui/kanban.tsx` L4,L6,L9,L12 | Remove `SortableContext`, `useSortable`, `verticalListSortingStrategy`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `cn`; prefix `T` → `_T` |
| `diceui/timeline.tsx` L3 | Remove `AlertCircle` |
| `useColbySocket.ts` L64 | Prefix `e` → `_e` |

### Phase 1b — Other Quick Fixes (5 errors)

| File | Line | Rule | Fix |
|------|------|------|-----|
| `message-bubble.tsx` | 37 | `no-empty` | Add `/* expected */` comment inside empty catch |
| `useCFDocsRuntime.ts` | 207 | `no-empty` | Add `/* expected */` comment inside empty catch |
| `accordion.tsx` | 70 | `ban-ts-comment` | Change `@ts-ignore` → `@ts-expect-error` |
| `command.tsx` | 29 | `no-empty-object-type` | Change `interface X extends Y {}` → `type X = Y` |
| `textarea.tsx` | 4 | `no-empty-object-type` | Same |
| `DeploymentAnimation.tsx` | 10 | `prefer-const` | Change `let interval` → `const interval` |

### Backend (2 warnings):

| File | Line | Fix |
|------|------|-----|
| `src/backend/src/ai/agents/Research.ts` | 217 | Change `catch(e)` → `catch` |
| `src/backend/src/routes/api/frontend/research/daily/trends.ts` | 8 | Prefix `DailyTrendSchema` → `_DailyTrendSchema` |

**Phase 1 total: ~126 errors + 2 backend warnings**

---

## Phase 2 — React Refresh / Fast Refresh (27 errors)

**Rule:** `react-refresh/only-export-components`

Files that export non-component values (constants, contexts, types) alongside components break HMR in dev. **Zero production impact.**

**Strategy:** Suppress with inline `// eslint-disable-next-line react-refresh/only-export-components` above offending exports. These are mostly third-party UI kit patterns (shadcn, kibo-ui, assistant-ui) that intentionally co-export `buttonVariants`, contexts, etc.

| File | Lines | Export causing issue |
|------|-------|---------------------|
| `assistant-ui/badge.tsx` | 67 | `badgeVariants` |
| `assistant-ui/diff-viewer.tsx` | 550-554 | 5 helper exports |
| `assistant-ui/reasoning.tsx` | 274 | helper export |
| `assistant-ui/select.tsx` | 243 | helper export |
| `assistant-ui/sources.tsx` | 134 | helper export |
| `kibo-ui/calendar/index.tsx` | 45,46,87,99 | 4 context/util exports |
| `kibo-ui/editor/index.tsx` | 140,1940 | 2 exports |
| `kibo-ui/gantt/index.tsx` | 62,63 | 2 exports |
| `kibo-ui/table/index.tsx` | 42 | context export |
| `ui/badge.tsx` | 38 | `badgeVariants` |
| `ui/button.tsx` | 58 | `buttonVariants` |
| `ui/form.tsx` | 170 | form field context |
| `ui/sidebar.tsx` | 770 | sidebar context |
| `context/AuthContext.tsx` | 1 | context export |
| `context/alerts-context.tsx` | 190 | context export |
| `context/auth-context.tsx` | 52 | context export |
| `context/jules-live-context.tsx` | 243 | context export |
| `workflows/TurboNode.tsx` | 21 | Anonymous component — **add name** |

**Phase 2 total: 27 errors**

---

## Phase 3 — setState in Effects (7 errors)

**Rule:** `react-hooks/set-state-in-effect` (React 19 compiler rule)

These are all standard patterns — fetch-on-mount, sync-props-to-state, read-external-on-mount. Safe to suppress.

**Strategy:** Add `// eslint-disable-next-line react-hooks/set-state-in-effect` above each `setState` call.

| File | Line | Pattern |
|------|------|---------|
| `assistant-ui/attachment.tsx` | 33 | FileReader cleanup |
| `assistant-ui/context-display.tsx` | 107 | Thread sync |
| `SystemPromptModal.tsx` | 270 | Fetch-on-mount |
| `useCFDocsRuntime.ts` | 63 | Thread message sync |
| `GeneralTab.tsx` | 57 | Sync API data to state |
| `auth-context.tsx` | 20 | Read cookie on mount |
| `WorkflowStudio.tsx` | 157 | Sync prop to state |

**Phase 3 total: 7 errors**

---

## Phase 4 — Exhaustive Deps (14 warnings)

**Strategy:** Wrap functions in `useCallback`, add missing deps, or wrap logical expressions in `useMemo`.

| File | Line | Missing Dep | Fix |
|------|------|-------------|-----|
| `numeric-keypad.tsx` | 42 | `handlePress`, `handleSubmit` | Wrap in `useCallback` |
| `useCFDocsRuntime.ts` | 66 | `thread` | Add to deps array |
| `useDeepResearchRuntime.ts` | 134 | `getWsUrl` | Wrap in `useCallback` or move into effect |
| `CloudflareDocsTool.tsx` | 307 | `activeThread` | Add to deps |
| `CloudflareDocsTool.tsx` | 648 | `fetchResource` | Wrap in `useCallback` |
| `CloudflareDocsPage.tsx` | 327 | `activeThread` | Add to deps |
| `CloudflareDocsPage.tsx` | 440 | `selectedModel` | Add to deps |
| `CloudflareDocsPage.tsx` | 666 | `fetchResource` | Wrap in `useCallback` |
| `WorkflowRunsTab.tsx` | 95 | `fetchRuns` | Wrap in `useCallback` |
| `ResearchDetail.tsx` | 79+84 | `fetchData` | Delete stale eslint-disable (L79); wrap `fetchData` in `useCallback([id])`, change deps to `[fetchData]` |
| `Dashboard.tsx` | 88 (×2) | `tasks` logical expr | Wrap `tasks` init in `useMemo` |
| `KanbanBoard.tsx` | 24 | `rawTasks` logical expr | Wrap in `useMemo` |

**Phase 4 total: 14 warnings + 1 stale directive**

---

## Phase 5 — Ref Access During Render (9 errors)

All in two files:

### `kibo-ui/gantt/index.tsx` (8 errors, lines 649 + 716)

`mouseRef.current?.getBoundingClientRect()` is read during render inside `useThrottle()`.

**Fix:** Cache rect in state via `ResizeObserver`:
```tsx
const [containerRect, setContainerRect] = useState({ x: 0, y: 0 });
useEffect(() => {
  const el = mouseRef.current;
  if (!el) return;
  const update = () => setContainerRect(el.getBoundingClientRect());
  update();
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => observer.disconnect();
}, []);
// Use containerRect.y instead of mouseRef.current?.getBoundingClientRect().y
```

### `AgentFactoryTool.tsx` (1 error, line 402)

`wsStatusRef.current = wsStatus` written during render.

**Fix:**
```tsx
useEffect(() => { wsStatusRef.current = wsStatus; }, [wsStatus]);
```

---

## Phase 6 — Impure Render Functions (2 errors)

### `sidebar.tsx` L663 — `Math.random()` in `useMemo`

```tsx
// Fix — use deterministic width:
const width = React.useMemo(() => `${(index * 17 % 40) + 50}%`, [index]);
```
Or pass a stable `seed` prop.

### `Dashboard.tsx` L116 — `Date.now()` during render

```tsx
// Fix:
const [now] = useState(() => Date.now());
const hoursAgo = useMemo(() => (now - deployTime) / (1000 * 60 * 60), [now, deployTime]);
```

---

## Phase 7 — Variable Before Declaration (2 errors)

### `jules-live-context.tsx` L200 + `useColbySocket.ts` L51

Both: `setTimeout(connect, delay)` inside WebSocket `onclose` references `connect` useCallback declared later.

**Fix:** Use a ref to break the forward reference:
```tsx
const connectRef = useRef<() => void>();

const connect = useCallback(() => {
  // ...
  ws.onclose = () => {
    reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
  };
}, [deps]);

connectRef.current = connect;
```

---

## Phase 8 — Misc (3 errors)

| File | Line | Rule | Fix |
|------|------|------|-----|
| `useHoniChatRuntime.ts` | 27 | `require-yield` | Add `yield` to generator, or convert to non-generator |
| `kibo-ui/gantt/index.tsx` | 1246 | `react-hooks/use-memo` | Replace `useCallback(throttle(...))` with `useMemo(() => throttle(...), [deps])` |
| `kibo-ui/table/index.tsx` | 66 | `react-hooks/incompatible-library` | Suppress: `// eslint-disable-next-line react-hooks/incompatible-library` |

---

## Phase 9 — Parser Config (from original, check if still present)

`test-exports.tsx` and `worker-configuration.d.ts` parser errors. Add to eslint ignores if still occurring.

---

## Execution Summary

| Phase | Problems Fixed | Effort | Risk |
|-------|---------------|--------|------|
| 1. Unused vars + quick fixes | ~128 | **Low** | None |
| 2. React refresh suppression | 27 | Low | None |
| 3. setState-in-effect suppression | 7 | Low | None |
| 4. Exhaustive deps | ~15 | Medium | Low |
| 5. Ref during render | 9 | Medium | Low |
| 6. Impure render | 2 | Low | None |
| 7. Variable before declaration | 2 | Medium | Low |
| 8. Misc | 3 | Low | None |
| **Total** | **~193** | | |

---

## Agent Prompt — Full Lint Fixit Run (All Phases)

Copy everything below the line and give it to your coding agent as a single prompt.

---

### Task: Fix All ESLint Errors Across Frontend and Backend — Full Sweep

You are executing a multi-phase lint cleanup. Work through ALL phases in order. After each file fix, update the tracking file `tmp/lint_fixit_list.json` in real time.

---

#### TRACKING FILE: `tmp/lint_fixit_list.json`

**Before you touch any code**, create `tmp/lint_fixit_list.json` with the initial state below. As you fix each file, update its `status` field immediately — do NOT batch updates. This file is your live progress tracker.

Status values: `"pending"` → `"fixed"` → `"verified"` (after eslint confirms). If a fix fails or you skip it, use `"skipped"` with a `note`.

```json
{
  "meta": {
    "created": "2026-03-29",
    "totalProblems": 193,
    "phases": 9
  },
  "phase1_unused_vars": {
    "description": "Unused imports, vars, empty catches, misc quick fixes",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/AgentWorkflowTimeline.tsx", "rule": "no-unused-vars", "fix": "Remove useEffect, useState, TimelineStep; prefix data → _data", "status": "pending" },
      { "file": "src/frontend/src/components/LiveOpsConsole.tsx", "rule": "no-unused-vars", "fix": "Remove RotateCcw; prefix lastMessage, isConnected", "status": "pending" },
      { "file": "src/frontend/src/components/RecentTasksCard.tsx", "rule": "no-unused-vars", "fix": "Remove cn", "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/shiki-highlighter.tsx", "rule": "no-unused-vars", "fix": "Check if _node/_components still flagged", "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/sources.tsx", "rule": "no-unused-vars", "fix": "Prefix asChild → _asChild", "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/CFCommandCenterNav.tsx", "rule": "no-unused-vars", "fix": "Remove Activity", "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/PromptDraftModal.tsx", "rule": "no-unused-vars", "fix": "Remove useRef", "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/SystemPromptModal.tsx", "rule": "no-unused-vars", "fix": "Remove ExternalLink", "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/useCFDocsRuntime.ts", "rule": "no-unused-vars+no-empty", "fix": "Remove updateThread; prefix e, userMsg, err; add comment in empty catch L207", "status": "pending" },
      { "file": "src/frontend/src/components/cloudflaresdk/CloudflareWorkerCosts.tsx", "rule": "no-unused-vars", "fix": "Remove Badge", "status": "pending" },
      { "file": "src/frontend/src/components/config/ConfigTable.tsx", "rule": "no-unused-vars", "fix": "Remove Eye, EyeOff; prefix toggleSecret, isSecret, isRevealed", "status": "pending" },
      { "file": "src/frontend/src/components/config/Header.tsx", "rule": "no-unused-vars", "fix": "Remove Separator, Save", "status": "pending" },
      { "file": "src/frontend/src/components/chat/message-bubble.tsx", "rule": "no-empty", "fix": "Add /* expected */ in empty catch", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/gantt/index.tsx", "rule": "no-unused-vars", "fix": "Verify _date prefix", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/tags/index.tsx", "rule": "no-unused-vars", "fix": "Prefix className → _className", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/tree/index.tsx", "rule": "no-unused-vars", "fix": "Prefix onClick → _onClick", "status": "pending" },
      { "file": "src/frontend/src/components/project-dashboard/LandingPageGenerator.tsx", "rule": "no-unused-vars", "fix": "Remove cn", "status": "pending" },
      { "file": "src/frontend/src/components/project-dashboard/hierarchy/KanbanView.tsx", "rule": "no-unused-vars", "fix": "Remove useState, useEffect, DragOverlay, SortableContext, verticalListSortingStrategy, CardTitle, CardContent, Bot, User, Avatar, AvatarFallback", "status": "pending" },
      { "file": "src/frontend/src/components/project-dashboard/tabs/ProjectsTab.tsx", "rule": "no-unused-vars", "fix": "Remove CardHeader, CardTitle, CardDescription", "status": "pending" },
      { "file": "src/frontend/src/components/projects/LandingGeneratorModal.tsx", "rule": "no-unused-vars", "fix": "Remove Input, Badge", "status": "pending" },
      { "file": "src/frontend/src/components/projects/NewProjectDialog.tsx", "rule": "no-unused-vars", "fix": "Remove DialogFooter, FormDescription", "status": "pending" },
      { "file": "src/frontend/src/components/research-chat/useDeepResearchRuntime.ts", "rule": "no-unused-vars", "fix": "Remove AssistantRuntimeProvider", "status": "pending" },
      { "file": "src/frontend/src/components/tools/AgentFactoryTool.tsx", "rule": "no-unused-vars", "fix": "Remove ScrollArea, Badge, Send, Square, Wrench, Code2, Zap, BookOpen, MicIcon; prefix SESSION_PREFIX", "status": "pending" },
      { "file": "src/frontend/src/components/tools/CloudflareDocsTool.tsx", "rule": "no-unused-vars", "fix": "Remove Code2, Search, Suggestions; prefix event → _event", "status": "pending" },
      { "file": "src/frontend/src/components/tools/registry-directory/RegistryDirectory.tsx", "rule": "no-unused-vars", "fix": "Prefix index → _index", "status": "pending" },
      { "file": "src/frontend/src/components/tools/toolbox/CloudflareDocsBetaPage.tsx", "rule": "no-unused-vars", "fix": "Remove Suggestions; prefix start → _start", "status": "pending" },
      { "file": "src/frontend/src/components/tools/toolbox/CloudflareDocsPage.tsx", "rule": "no-unused-vars", "fix": "Remove useNavigate, Send, Package2, Globe, Activity, Square, Settings, MicIcon, SquareIcon, TabsList, TabsTrigger; prefix err, paramMatch", "status": "pending" },
      { "file": "src/frontend/src/components/webhooks/LiveEventsTab.tsx", "rule": "no-unused-vars", "fix": "Prefix queryClient → _queryClient", "status": "pending" },
      { "file": "src/frontend/src/components/workflows/WorkflowRunsTab.tsx", "rule": "no-unused-vars", "fix": "Remove CheckCircle2, XCircle, AlertCircle, CardDescription; prefix loading", "status": "pending" },
      { "file": "src/frontend/src/components/workflows/data.tsx", "rule": "no-unused-vars", "fix": "Remove FiFileText, FiAlertCircle", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/ConflictResolver.tsx", "rule": "no-unused-vars", "fix": "Prefix both e → _e", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/ConsultationSplitPane.tsx", "rule": "no-unused-vars", "fix": "Remove Blocks, CheckCircle2", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/DecisionInbox.tsx", "rule": "no-unused-vars", "fix": "Remove CardContent; prefix both err → _err", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/DeploymentAnimation.tsx", "rule": "prefer-const", "fix": "Change let interval → const interval", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/DiffViewer.tsx", "rule": "no-unused-vars", "fix": "Prefix taskEventId → _taskEventId", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/LiveTerminal.tsx", "rule": "no-unused-vars", "fix": "Prefix e → _e", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/MemoryExplorer.tsx", "rule": "no-unused-vars", "fix": "Prefix e → _e", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/MillerMarketplace.tsx", "rule": "no-unused-vars", "fix": "Prefix e → _e", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/ReviewSummary.tsx", "rule": "no-unused-vars", "fix": "Prefix both err → _err", "status": "pending" },
      { "file": "src/frontend/src/components/workshop/SessionTimeline.tsx", "rule": "no-unused-vars", "fix": "Prefix i → _i", "status": "pending" },
      { "file": "src/frontend/src/context/auth-context.tsx", "rule": "no-unused-vars", "fix": "Prefix COOKIE_EXPIRES_DAYS → _COOKIE_EXPIRES_DAYS", "status": "pending" },
      { "file": "src/frontend/src/hooks/useColbySocket.ts", "rule": "no-unused-vars", "fix": "Prefix e → _e", "status": "pending" },
      { "file": "src/frontend/src/views/control/global/useHoniChatRuntime.ts", "rule": "no-unused-vars+require-yield", "fix": "Remove ThreadMessage, useCallback; prefix isRunning, reject; fix generator yield", "status": "pending" },
      { "file": "src/frontend/src/components/ui/accordion.tsx", "rule": "ban-ts-comment", "fix": "Change @ts-ignore → @ts-expect-error", "status": "pending" },
      { "file": "src/frontend/src/components/ui/command.tsx", "rule": "no-empty-object-type", "fix": "Change empty interface to type alias", "status": "pending" },
      { "file": "src/frontend/src/components/ui/textarea.tsx", "rule": "no-empty-object-type", "fix": "Change empty interface to type alias", "status": "pending" },
      { "file": "src/frontend/src/components/ui/diceui/kanban.tsx", "rule": "no-unused-vars", "fix": "Remove SortableContext, useSortable, verticalListSortingStrategy, Card, CardContent, CardHeader, CardTitle, cn; prefix T", "status": "pending" },
      { "file": "src/frontend/src/components/ui/diceui/timeline.tsx", "rule": "no-unused-vars", "fix": "Remove AlertCircle", "status": "pending" },
      { "file": "src/backend/src/ai/agents/Research.ts", "rule": "no-unused-vars", "fix": "Change catch(e) → catch", "status": "pending" },
      { "file": "src/backend/src/routes/api/frontend/research/daily/trends.ts", "rule": "no-unused-vars", "fix": "Prefix DailyTrendSchema → _DailyTrendSchema", "status": "pending" }
    ]
  },
  "phase2_react_refresh": {
    "description": "Suppress react-refresh/only-export-components on UI kit files",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/assistant-ui/badge.tsx", "line": 67, "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/diff-viewer.tsx", "lines": "550-554", "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/reasoning.tsx", "line": 274, "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/select.tsx", "line": 243, "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/sources.tsx", "line": 134, "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/calendar/index.tsx", "lines": "45,46,87,99", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/editor/index.tsx", "lines": "140,1940", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/gantt/index.tsx", "lines": "62,63", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/table/index.tsx", "line": 42, "status": "pending" },
      { "file": "src/frontend/src/components/ui/badge.tsx", "line": 38, "status": "pending" },
      { "file": "src/frontend/src/components/ui/button.tsx", "line": 58, "status": "pending" },
      { "file": "src/frontend/src/components/ui/form.tsx", "line": 170, "status": "pending" },
      { "file": "src/frontend/src/components/ui/sidebar.tsx", "line": 770, "status": "pending" },
      { "file": "src/frontend/src/context/AuthContext.tsx", "line": 1, "status": "pending" },
      { "file": "src/frontend/src/context/alerts-context.tsx", "line": 190, "status": "pending" },
      { "file": "src/frontend/src/context/auth-context.tsx", "line": 52, "status": "pending" },
      { "file": "src/frontend/src/context/jules-live-context.tsx", "line": 243, "status": "pending" },
      { "file": "src/frontend/src/components/workflows/TurboNode.tsx", "line": 21, "fix": "Add component name to anonymous export", "status": "pending" }
    ]
  },
  "phase3_set_state_in_effect": {
    "description": "Suppress react-hooks/set-state-in-effect on standard fetch/sync patterns",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/assistant-ui/attachment.tsx", "line": 33, "status": "pending" },
      { "file": "src/frontend/src/components/assistant-ui/context-display.tsx", "line": 107, "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/SystemPromptModal.tsx", "line": 270, "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/useCFDocsRuntime.ts", "line": 63, "status": "pending" },
      { "file": "src/frontend/src/components/settings/GeneralTab.tsx", "line": 57, "status": "pending" },
      { "file": "src/frontend/src/context/auth-context.tsx", "line": 20, "status": "pending" },
      { "file": "src/frontend/src/components/workflows/WorkflowStudio.tsx", "line": 157, "status": "pending" }
    ]
  },
  "phase4_exhaustive_deps": {
    "description": "Fix missing useEffect/useCallback/useMemo dependencies",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/auth/numeric-keypad.tsx", "line": 42, "fix": "Wrap handlePress, handleSubmit in useCallback", "status": "pending" },
      { "file": "src/frontend/src/components/cloudflare-chat/useCFDocsRuntime.ts", "line": 66, "fix": "Add thread to deps", "status": "pending" },
      { "file": "src/frontend/src/components/research-chat/useDeepResearchRuntime.ts", "line": 134, "fix": "Wrap getWsUrl in useCallback", "status": "pending" },
      { "file": "src/frontend/src/components/tools/CloudflareDocsTool.tsx", "lines": "307,648", "fix": "Add activeThread dep; wrap fetchResource in useCallback", "status": "pending" },
      { "file": "src/frontend/src/components/tools/toolbox/CloudflareDocsPage.tsx", "lines": "327,440,666", "fix": "Add activeThread, selectedModel deps; wrap fetchResource in useCallback", "status": "pending" },
      { "file": "src/frontend/src/components/workflows/WorkflowRunsTab.tsx", "line": 95, "fix": "Wrap fetchRuns in useCallback", "status": "pending" },
      { "file": "src/frontend/src/views/research/ResearchDetail.tsx", "lines": "79,84", "fix": "Delete stale eslint-disable L79; wrap fetchData in useCallback([id])", "status": "pending" },
      { "file": "src/frontend/src/views/repos/Dashboard.tsx", "line": 88, "fix": "Wrap tasks init in useMemo", "status": "pending" },
      { "file": "src/frontend/src/views/repos/KanbanBoard.tsx", "line": 24, "fix": "Wrap rawTasks in useMemo", "status": "pending" }
    ]
  },
  "phase5_refs_during_render": {
    "description": "Move ref reads out of render path into effects",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/kibo-ui/gantt/index.tsx", "lines": "649,716", "fix": "Cache mouseRef rect in state via ResizeObserver effect", "status": "pending" },
      { "file": "src/frontend/src/components/tools/AgentFactoryTool.tsx", "line": 402, "fix": "Move wsStatusRef.current = wsStatus into useEffect", "status": "pending" }
    ]
  },
  "phase6_impure_render": {
    "description": "Replace impure function calls during render with stable alternatives",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/ui/sidebar.tsx", "line": 663, "fix": "Replace Math.random() with deterministic width", "status": "pending" },
      { "file": "src/frontend/src/views/repos/Dashboard.tsx", "line": 116, "fix": "Replace Date.now() with useState(() => Date.now())", "status": "pending" }
    ]
  },
  "phase7_variable_before_declaration": {
    "description": "Fix forward references to useCallback in WebSocket handlers",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/context/jules-live-context.tsx", "line": 200, "fix": "Use connectRef pattern to break forward reference", "status": "pending" },
      { "file": "src/frontend/src/hooks/useColbySocket.ts", "line": 51, "fix": "Use connectRef pattern to break forward reference", "status": "pending" }
    ]
  },
  "phase8_misc": {
    "description": "Miscellaneous one-off fixes",
    "status": "pending",
    "items": [
      { "file": "src/frontend/src/components/kibo-ui/gantt/index.tsx", "line": 1246, "rule": "react-hooks/use-memo", "fix": "Replace useCallback(throttle(...)) with useMemo(() => throttle(...))", "status": "pending" },
      { "file": "src/frontend/src/components/kibo-ui/table/index.tsx", "line": 66, "rule": "react-hooks/incompatible-library", "fix": "Suppress with eslint-disable comment", "status": "pending" }
    ]
  }
}
```

---

#### WORKFLOW

For each phase, follow this loop:

1. **Read** the file to understand context around the error line(s).
2. **Edit** the file using the fix described in the tracking JSON.
3. **Update** `tmp/lint_fixit_list.json` — set that item's `status` to `"fixed"`.
4. After completing all items in a phase, update the phase-level `status` to `"fixed"`.
5. Move to the next phase.

After ALL phases are done:

6. **Run verification:**
   ```bash
   cd src/frontend && node node_modules/eslint/bin/eslint.js . 2>&1 | tail -5
   ```
7. Update any items that still show errors to `"skipped"` with a `note` explaining why.
8. Update items that pass to `"verified"`.
9. Set the final phase statuses accordingly.

---

#### FIX RULES BY PHASE

**Phase 1 — Unused vars & quick fixes (DO NOT change any logic):**
- Unused imports → remove from import statement
- Unused function params (`e`, `err`, `data`, `reject`, `event`, `index`, `i`) → prefix with `_`
- Unused destructured vars → prefix with `_` (e.g., `{ foo: _foo }`)
- Unused assigned vars (`const x = ...`) → prefix with `_`
- Empty catch blocks (`catch(e) {}`) → change to `catch { /* expected */ }`
- `@ts-ignore` → change to `@ts-expect-error` (accordion.tsx L70)
- Empty interfaces → change to type aliases (`type X = Y` not `interface X extends Y {}`)
- `let` → `const` where never reassigned (DeploymentAnimation.tsx L10)
- Backend: `Research.ts` L217 `catch(e)` → `catch`; `trends.ts` L8 prefix `DailyTrendSchema` → `_DailyTrendSchema`

**Phase 2 — React refresh (27 errors):**
- Add `// eslint-disable-next-line react-refresh/only-export-components` above each offending export line
- For `TurboNode.tsx`: add a name to the anonymous component export

**Phase 3 — setState in effects (7 errors):**
- Add `// eslint-disable-next-line react-hooks/set-state-in-effect` above each `setState` call inside an effect
- These are standard fetch-on-mount / sync patterns that are safe

**Phase 4 — Exhaustive deps (14 warnings):**
- Wrap callback functions in `useCallback` then add to deps array
- For logical expressions (`tasks || []`), wrap the init in `useMemo`
- For `ResearchDetail.tsx`: delete stale eslint-disable on L79, wrap fetchData in `useCallback([id])`, update useEffect deps to `[fetchData]`

**Phase 5 — Ref during render (9 errors):**
- `gantt/index.tsx` L649+716: Cache `mouseRef.current.getBoundingClientRect()` in state via a `ResizeObserver` in a `useEffect`, then use the cached state value instead of the ref
- `AgentFactoryTool.tsx` L402: Move `wsStatusRef.current = wsStatus` into `useEffect(() => { wsStatusRef.current = wsStatus; }, [wsStatus])`

**Phase 6 — Impure render (2 errors):**
- `sidebar.tsx` L663: Replace `Math.random()` with deterministic value based on index: `const width = React.useMemo(() => \`${(index * 17 % 40) + 50}%\`, [index])`
- `Dashboard.tsx` L116: Replace `Date.now()` with `const [now] = useState(() => Date.now())` then use `now` in the calculation

**Phase 7 — Variable before declaration (2 errors):**
- Both files use `setTimeout(connect, delay)` in a WebSocket `onclose` handler where `connect` is a `useCallback` declared later
- Fix: add `const connectRef = useRef<() => void>()` at top, set `connectRef.current = connect` after the useCallback, and change the setTimeout to `setTimeout(() => connectRef.current?.(), delay)`

**Phase 8 — Misc (2 errors):**
- `gantt/index.tsx` L1246: Replace `useCallback(throttle(() => { ... }, 100), [])` with `useMemo(() => throttle(() => { ... }, 100), [])`
- `kibo-ui/table/index.tsx` L66: Add `// eslint-disable-next-line react-hooks/incompatible-library` above the `useReactTable` call

---

#### IMPORTANT CONSTRAINTS
- Do NOT change application logic. Only fix lint issues.
- Do NOT delete code that is used — read the file first to confirm the symbol is truly unused.
- If you're unsure whether a fix is safe, set status to `"skipped"` with a `note` and move on.
- Keep `tmp/lint_fixit_list.json` updated after EVERY file edit — this is your live progress report.
- The goal is **zero eslint errors** when running `cd src/frontend && node node_modules/eslint/bin/eslint.js . 2>&1 | tail -5`.

---
