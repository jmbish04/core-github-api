# Rule: Dual-Scope Routing Paradigm

## Overview

This application enforces a strict **Dual-Scope Paradigm** for all views and API calls.
Every new route, component, and API endpoint must declare which scope it belongs to.

---

## Scope Definitions

### 🌐 Global Scope
- **URL prefix:** `/` (no `/repos/:owner/:repo` prefix)
- **Purview:** cross-repository; holistic planning; master dashboards; settings
- **Route file:** `src/frontend/src/routes/GlobalRoutes.tsx`
- **API pattern:** `/api/projects`, `/api/global/*`, `/api/tasks`, `/api/settings`
- **Examples:** `/projects`, `/kanban`, `/roadmap`, `/dashboard`, `/chat`, `/workshop`

### 🗂️ Active Workspace (Repo-Specific) Scope
- **URL prefix:** `/repos/:owner/:repo/...`
- **Purview:** strictly confined to a single selected GitHub `owner/repo`
- **Route file:** `src/frontend/src/routes/RepoRoutes.tsx`
- **API pattern:** `/api/repos/:owner/:repo/*`
- **Examples:** `/repos/jmbish04/core-github-api/plan`, `.../prs`, `.../explorer`

---

## Rule 1 — Scope Declaration Before Implementation

**When adding any new view, you MUST first determine its scope:**

```
Is this view useful regardless of which repo is selected?
  → YES → Global Scope → add to GlobalRoutes.tsx
  → NO  → Repo Scope  → add to RepoRoutes.tsx
```

Never add a route without explicitly declaring its scope in a comment:
```tsx
// SCOPE: GLOBAL — shows PRs across all watched repos
<Route path="/pr-center" element={<PRCommandCenter />} />

// SCOPE: REPO — shows PRs only for the active owner/repo workspace
<Route path="prs" element={<RepoPRs />} />
```

---

## Rule 2 — React Router v6 Relative Paths (MANDATORY)

**Never repeat the parent path in a nested child route.**

```tsx
// ❌ WRONG — resolves to /repos/:owner/:repo/repos/:owner/:repo/plan
<Route path="/repos/:owner/:repo" element={<RepoLayout />}>
  <Route path="repos/:owner/:repo/plan" element={<RepoPlan />} />
</Route>

// ✅ CORRECT — resolves to /repos/:owner/:repo/plan
<Route path="/repos/:owner/:repo" element={<RepoLayout />}>
  <Route path="plan" element={<RepoPlan />} />
</Route>
```

**Checklist for every child route inside `RepoRoutes.tsx`:**
- [ ] Path does NOT start with `/`
- [ ] Path does NOT contain `repos/:owner/:repo`
- [ ] Path is a relative segment only (e.g., `"plan"`, `"projects/kanban"`)

---

## Rule 3 — Hono API Scope Validation

All Hono router definitions must enforce scope validation with Zod.

### Global API endpoints
```typescript
// src/backend/src/routes/api/global/projects.ts
app.get("/api/projects", zValidator("query", GlobalProjectQuerySchema), handler);
```

### Repo-scoped API endpoints
Every repo-scoped route must validate `owner` and `repo` using a shared Zod schema:

```typescript
// src/backend/src/routes/api/repos/[owner]/[repo]/projects.ts
const RepoParamsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

app.get("/api/repos/:owner/:repo/projects",
  zValidator("param", RepoParamsSchema),
  async (c) => { /* ... */ }
);
```

**Never** serve repo-scoped data from a global endpoint.
**Never** call a global endpoint from a component inside `RepoRoutes.tsx`.

---

## Rule 4 — File Placement

| Artifact | Global scope | Repo scope |
|---|---|---|
| Route definition | `src/frontend/src/routes/GlobalRoutes.tsx` | `src/frontend/src/routes/RepoRoutes.tsx` |
| View component | `src/frontend/src/views/control/global/` | `src/frontend/src/views/repos/` |
| Hono API handler | `src/backend/src/routes/api/...` | `src/backend/src/routes/api/repos/...` |
| TanStack Query hook | uses `/api/*` | uses `/api/repos/:owner/:repo/*` |
| Context dependency | no repo context needed | must consume `useRepoContext()` |

---

## Rule 5 — App.tsx Is a Composition Layer Only

`App.tsx` must remain a thin provider + route composition layer.
It imports `GlobalRoutes` and `RepoRoutes` and renders them inside `<Routes>`.
**No route definitions belong directly in `App.tsx`.**

```tsx
// ✅ Correct App.tsx pattern
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {GlobalRoutes()}
          {RepoRoutes()}
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```
