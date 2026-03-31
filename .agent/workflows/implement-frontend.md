# Stitch-to-Jules Frontend Implementation Workflow

> **Orchestration Pattern** for building frontend views in the `core-github-api` monolith.
> Last updated: 2026-03-28

---

## Overview

This workflow defines the **Stitch-to-Jules Loop** — a three-phase orchestration pattern for scaffolding new frontend views using external AI design and code generation tools, integrated into our Astro + React + Hono + Cloudflare Workers stack.

## Architecture: The "Thin Wrapper" DRY Strategy

**Never rebuild from scratch.** Before creating any new view:

1. **Audit existing global views** for reusable rendering logic
2. **Extract shared UI components** into `src/frontend/src/components/shared/`
3. **Build thin repo-scoped wrappers** that:
   - Call `useOutletContext()` for repo-scoped data
   - Render a repo-specific header (repo name, breadcrumb badge)
   - Pass data into the extracted shared component

Only use the full Stitch-to-Jules loop for views that have **no existing global analog**.

## Shared Components Registry

| Component | File | Used By |
|---|---|---|
| `TaskKanbanBoard` | `components/shared/TaskKanbanBoard.tsx` | Global Kanban, Repo Kanban |
| `kanban-utils` | `components/shared/kanban-utils.ts` | Kanban views (columns, mapping) |
| `ProjectCardGrid` | `components/shared/ProjectCardGrid.tsx` | Global Projects, Repo Projects |
| `project-utils` | `components/shared/project-utils.ts` | Project views (health, types) |
| `ActivityFeed` | `components/shared/ActivityFeed.tsx` | Global Dashboard, Repo Dashboard |

## Phase 1: Discovery & UX Planning

1. Read `src/routes/GlobalRoutes.tsx` and `src/routes/RepoRoutes.tsx`
2. Identify views that are missing, placeholder, or reusing global variants
3. Audit RepoLayout's `useOutletContext` shape (lines ~419-429 of `layouts/RepoLayout.tsx`)
4. Produce `design.md` with Shadcn/Tailwind tokens and `project_tasks.json` with SWARM schema
5. **Pause for human review** before proceeding

## Phase 2: Stitch Loop (Wireframing)

For each new view (not a thin wrapper):

```
stitch.create_project({ title: "View Name" })
stitch.generate_screen_from_text({
  projectId: "<id>",
  deviceType: "DESKTOP",
  modelId: "GEMINI_3_1_PRO",
  prompt: "<design brief including Brutalist Sanctuary tokens>"
})
stitch.generate_screen_from_text({
  projectId: "<id>",
  deviceType: "MOBILE",
  modelId: "GEMINI_3_1_PRO",
  prompt: "<mobile variant brief>"
})
```

### Design System Reference: "The Brutalist Sanctuary"

| Token | Value | Usage |
|---|---|---|
| Background | `oklch(0.145 0 0)` / `#131315` | Page base |
| Surface Low | `#1c1b1d` | Primary layout blocks |
| Surface Container | `#201f22` | Interactive elements |
| Surface High | `#2a2a2c` | Raised elements |
| Primary text | Pure White | Headlines |
| Muted text | `#acaab1` | Body, descriptions |
| Primary accent | `#4edea3` (emerald) | Healthy/success |
| Error accent | `#ee7d77` | Error states |
| Border rule | **NO hard borders** | Use tonal shifts |
| Roundedness | `0.25rem` default, `0.5rem` max | Sharp, architectural |

Always generate **both Desktop (1440x900) and Mobile (390x844)** canvases.

## Phase 3: Jules Translation (UI Engineering)

Pass Stitch HTML to Jules MCP for React/shadcn conversion:

```
jules.create_session({
  source: "github.com/<owner>/<repo>",
  title: "View Translation",
  prompt: "<detailed spec with imports, data contract, component structure>"
})
jules.wait_for_session_completion({ session_id: "<id>" })
```

### Jules Prompt Template

Include in every Jules prompt:
- **Environment**: Cloudflare Worker Assets — NO Node.js APIs
- **Stack**: React component (.tsx), shadcn/ui (New York, Dark), Tailwind CSS
- **Data contract**: Exact `useOutletContext` shape with TypeScript types
- **Imports**: Specific shadcn/ui + lucide-react imports to use
- **Responsive**: `grid-cols-1 md:grid-cols-N` patterns
- **Output**: COMPLETE file, no truncation

### Fallback

If Jules MCP is unavailable (missing tokens, connectivity), translate the Stitch wireframes manually following the exact same spec. The Stitch HTML provides the pixel-perfect layout reference.

## Phase 4: Integration & Wiring

1. Write the generated `.tsx` file to the correct path
2. Update `RepoRoutes.tsx` or `GlobalRoutes.tsx` with new imports and route elements
3. Remove unused imports from route files
4. Refactor global views to use shared components (DRY)
5. Verify: `cd src/frontend && npx astro build`

## Data Flow Reference

```
RepoLayout (fetches overview, tasks, details)
  └─ useOutletContext() provides:
       ├─ projectId: string
       ├─ repoOwner: string
       ├─ repoName: string
       ├─ basePath: string
       ├─ overview: { project, repository, cloudflare, pendingPrs, recentActivity, codebase, tags }
       ├─ entries: Entry[]
       ├─ projectDetails: { phases: Phase[] }
       ├─ taskQueryData: { tasks: Task[] }
       └─ setSelectedEvent: (event) => void
```

## File Conventions

| Type | Path | Naming |
|---|---|---|
| Shared component | `src/frontend/src/components/shared/` | PascalCase.tsx |
| Shared utilities | `src/frontend/src/components/shared/` | kebab-case.ts |
| Repo view | `src/frontend/src/views/repos/` | PascalCase.tsx |
| Global view | `src/frontend/src/views/control/global/` | PascalCase.tsx |
| Route file | `src/frontend/src/routes/` | PascalCase.tsx |

## Checklist for New Views

- [ ] Does a global analog exist? → Extract shared component first
- [ ] Is it a thin wrapper? → Skip Stitch/Jules, just write the wrapper
- [ ] Stitch desktop + mobile wireframes generated?
- [ ] Jules translation completed (or manual fallback)?
- [ ] Routes updated in `RepoRoutes.tsx` or `GlobalRoutes.tsx`?
- [ ] Unused imports cleaned up?
- [ ] Build passes (`npx astro build`)?
- [ ] Error Handling uses `handleGlobalError`? (NO raw `toast.error` or generic `<Alert>` for API failures)
- [ ] Mobile responsive at 375px?
- [ ] Data flows correctly from `useOutletContext` or TanStack Query?
