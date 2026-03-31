# Project Vision & Constitution: `Agentic Sentinality — The Agent Meta-Governance & Immune System`

> **AGENT INSTRUCTION:** Read this file before every iteration. It serves as the project's "Long-Term Memory." Do not deviate from these rules.

---

## 1. Core Identity

- **Project Name:** `Agentic Sentinality — The Agent Meta-Governance & Fleet Immune System`
- **Mission:** Eliminate the "repetition tax" by monitoring AI agent failures and enforcing fleet-wide architectural standards.
- **Target Audience:** Senior AI Engineers, DevOps/SRE Agents, Automated Code Reviewers.
- **Voice:** Authoritative, minimal, terminal-esque. Dense data over decorative chrome.

---

## 2. Visual Language: "The Monolith" (Brutalist Sanctuary)

### Core Principle
Hierarchy is created entirely through **tonal depth** — darker = background, lighter = elevated surface. Never through lines, borders, or decorative elements.

### Color System (OKLCH Zinc)

| Layer | Tailwind Class | Usage |
|-------|---------------|-------|
| Base | `bg-zinc-950` | Page backgrounds, outermost containers |
| Card | `bg-zinc-900` | Cards, panels, sidebar |
| Elevated | `bg-zinc-800` | Hover states, active nav items, code blocks |
| Surface High | `bg-zinc-700` | Badges, tags, input fields |
| Text Primary | `text-zinc-50` | Headings, critical data |
| Text Secondary | `text-zinc-400` | Labels, timestamps, captions |
| Text Accent | `text-zinc-200` | Metric values, highlighted data |
| Destructive | `text-red-400` | Errors, critical severity |
| Success | `text-emerald-400` | Healthy status, resolved insights |
| Warning | `text-amber-400` | Medium severity, pending states |

### Absolute Rules
1. **ZERO borders.** No `border`, `border-zinc-*`, `divide-*`, `ring-*` classes anywhere.
2. **OKLCH colorspace** for all custom color calculations in CSS variables.
3. Recharts: ALL axis ticks, labels, tooltips → `fill="#fafafa"` or `fill="var(--zinc-50)"`.
4. Typography: `tracking-tighter` on H1 and H2. `font-mono` on metric values.
5. Every page MUST include the "System Health" Immunity Indicator in top-right corner.
6. Sidebar (`AppSidebar`) present on ALL pages — collapsible on mobile.

---

## 3. Architecture & File Structure

```
frontend/src/
├── pages/learning/
│   ├── dashboard.astro          → C2 Dashboard
│   ├── insights.astro           → Insight Ledger
│   ├── sessions.astro           → Audit Log
│   ├── babysitter.astro         → Babysitter HUD
│   └── showcase.astro           → Standardization Gallery
├── components/learning/
│   ├── InsightCard.tsx
│   ├── InsightGrid.tsx
│   ├── SessionRow.tsx
│   ├── BabysitterSessionCard.tsx
│   ├── PatternDistributionChart.tsx
│   └── InsightTrendChart.tsx
└── components/layout/
    └── AppSidebar.tsx            → Persistent sidebar (must be used on ALL learning pages)
```

**One `.astro` file per view. No multi-tab monoliths.**
**Asset flow:** Stitch generates screens → Developer validates → Promote to `pages/learning/`.

---

## 4. Live Sitemap

### View 1: C2 Dashboard
- **Route:** `/learning/dashboard`
- **File:** `frontend/src/pages/learning/dashboard.astro`
- **Purpose:** Fleet health at a glance. Command and control for Sentinel operations.
- **Key Components:**
  - `InsightTrendChart` — Recharts `<AreaChart>`, insights/day over last 30 days
  - `PatternDistributionChart` — Recharts `<BarChart>`, counts by pattern type
  - Jules session status cards (live, `bg-zinc-900`)
  - "Immunity Score" — percentage of patterns with `outcome = 'succeeded'`
  - Top-right pulse indicator: green (healthy) / amber (active interventions) / red (critical unresolved)
- **API:** `GET /api/learning/insights/global`, `GET /health/learning`

### View 2: Insight Ledger
- **Route:** `/learning/insights`
- **File:** `frontend/src/pages/learning/insights.astro`
- **Purpose:** Searchable, filterable registry of every detected architectural failure pattern.
- **Key Components:**
  - `InsightGrid` — responsive CSS grid of `InsightCard` components
  - Filter bar: pattern type (doom_loop / anti_pattern / standard_violation / best_practice), severity (1–5), status (open / resolved)
  - `InsightCard` — title, severity badge, prior-fix count, "View in Jules" CTA, Contemplation Gate last decision
  - Pagination: 20 per page
- **API:** `GET /api/learning/insights?patternType=&severity=&status=`

### View 3: Audit Log
- **Route:** `/learning/sessions`
- **File:** `frontend/src/pages/learning/sessions.astro`
- **Purpose:** Deep-dive into every analysis run. Track ingestion history and pattern extraction evidence.
- **Key Components:**
  - Shadcn `<Table>` with collapsible rows
  - Columns: Session ID (truncated + copy button), Trigger Type, Insights Found, Duration, Status badge, Timestamp
  - Expanded row: message sample list, model used, `repoless` flag, linked insight IDs
- **API:** `GET /api/learning/sessions`

### View 4: Babysitter HUD
- **Route:** `/learning/babysitter`
- **File:** `frontend/src/pages/learning/babysitter.astro`
- **Purpose:** Real-time monitoring and manual intervention for active Jules sessions.
- **Key Components:**
  - `BabysitterSessionCard` — per session: loop detection score (0–10 badge), last message preview, intervention count, time since last activity
  - "Manual Override" button → `POST /api/learning/upscale` with sessionId
  - Intervention log table: timestamp, session ID, override message excerpt, outcome
  - Auto-refresh every 30 seconds via `setInterval`
- **API:** `GET /api/sentinel/status`, `POST /api/learning/upscale`

### View 5: Standardization Gallery
- **Route:** `/learning/showcase`
- **File:** `frontend/src/pages/learning/showcase.astro`
- **Purpose:** View the fleet's current golden path standards and trigger upscale runs.
- **Key Components:**
  - Cards for each `.agent/rules/*.md` file — title, rule summary, adherence score across tracked repos
  - Standard file previews: `tsconfig.json`, `AGENTS.md`, `wrangler.jsonc` template
  - "Trigger Standardization Upscale" CTA button
- **API:** `GET /api/learning/insights/global`, `POST /api/learning/upscale`

---

## 5. Persistent Components

### `AppSidebar` (All Pages)
- Background: `bg-zinc-900`, no border on right edge
- Navigation items: Dashboard, Insight Ledger, Audit Log, Babysitter HUD, Gallery
- Active item: `bg-zinc-800` background (tonal depth, not border or underline)
- Collapsible: icon-only mode at `< 768px`
- Bottom: "Agent Chat" toggle → `assistant-ui` sidebar integration

### Global Status Indicator (All Pages)
- **Top-right of every page**
- Pulse animation dot: `bg-emerald-400` (healthy) / `bg-amber-400` (active interventions) / `bg-red-400` (critical)
- Label: "Immunity: XX%" based on `succeeded / total` reflections ratio

---

## 6. Persistent Design Rules

1. Viewport standards: **1440×900** (desktop), **390×844** (mobile). Test both.
2. Forbid `border` CSS classes. Hierarchy through `bg-zinc-*` depth only.
3. Every page: `AppSidebar` + `UnifiedErrorDisplay` wrapper on async data sections.
4. Recharts: `fill="#fafafa"` on all tick labels, legend text, tooltip content.
5. Typography: `tracking-tighter text-zinc-50` on H1/H2. `font-mono text-zinc-200` on all numeric metrics.
6. Shadcn components: dark variant only. No light mode support required in v1.
7. FORBIDDEN: Vercel AI SDK. All AI calls via API routes → Workers AI.
8. Error states: `UnifiedErrorDisplay` from `frontend/src/components/ErrorDisplay/`.
9. No multi-tab components (Shadcn `<Tabs>` within a page). Each section = a separate route.
