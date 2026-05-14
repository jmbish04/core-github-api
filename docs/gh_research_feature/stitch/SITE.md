# SITE.md — gh_research_feature

**Vision:** turn the worker into a personal research librarian — methodical, transparent, compounding knowledge over time. Every research action is auditable; every finding feeds a growing library; the library feeds project planning and enforced agent rules.

**Information architecture:**
- **Library** is the entry point — the user lands on the curated knowledge first, can pivot to active jobs
- **Live viewing** is replay-able — finished sessions look identical to live sessions, with a scrubber
- **Promotion** is opt-in but high-leverage — selected findings become planning briefs or enforceable rules

---

## Sitemap

```
core-github-api worker
├── /                              (existing dashboard, link to /research/gh)
├── /research/                     (existing research views, link to /research/gh)
├── /research/gh                   [LIBRARY]    Main entry — three tabs
│   ├── /research/gh/new           [INTAKE]     Three-mode intake form
│   ├── /research/gh/jobs/         (list — folded into Library tab)
│   │   ├── /research/gh/jobs/[id] [LIVE]       Live job viewer (transcript + timeline + sources)
│   │   └── /research/gh/jobs/[id]/replay [REPLAY] Same UI, replay mode with scrubber
│   ├── /research/gh/findings/[id] [DETAIL]     Source detail + code excerpts + actions
│   ├── /research/gh/saved-searches [LIST]      Saved search CRUD
│   ├── /research/gh/categories    [LIST]       Tag/category CRUD
│   ├── /research/gh/weekly        [DIGEST]     Weekly digest archive + config
│   ├── /research/gh/health        [HEALTH]     On-demand health suite dashboard
│   ├── /research/gh/send-to-planning [FLOW]    Multi-select → Orchestrator brief
│   └── /research/gh/promote-to-rules [FLOW]    Multi-select → rule PR
├── /sessions                      [SESSIONS]   Global active-sessions monitor
│   └── /sessions/[id]             [TRANSCRIPT] Direct session viewer (non-feature sessions)
├── /docs/research/                [DOCS]       Public docs for gh-research
│   ├── overview
│   ├── on-demand
│   ├── pre-planning
│   ├── weekly
│   ├── library
│   ├── send-to-planning
│   ├── promote-to-rules
│   ├── health
│   ├── architecture
│   ├── api
│   └── troubleshooting
└── /docs/agentic-session/         [DOCS]       Public docs for AgenticSession service
    ├── overview
    ├── api
    ├── auth
    ├── integration-guide
    └── migration-from-legacy
```

---

## Per-page contract (Stitch generation order)

Generate Stitch mockups in this order. Wave 1 covers AgenticSession surface; later waves cover gh-research.

### Wave 1 — AgenticSession (EPIC-0 prerequisite)

| # | Page | Baton file | Priority |
|---|---|---|---|
| 1 | `/sessions` global monitor | `next-prompt-sessions-monitor.md` | P0 |
| 2 | `/sessions/[id]` standalone transcript | `next-prompt-session-transcript.md` | P0 |

### Wave 2 — Library backbone (EPIC-7)

| # | Page | Baton file | Priority |
|---|---|---|---|
| 3 | `/research/gh` library landing (3 tabs) | `next-prompt-gh-library.md` | P0 |
| 4 | `/research/gh/new` intake (3 modes) | `next-prompt-gh-intake.md` | P0 |
| 5 | `/research/gh/jobs/[id]` live viewer | `next-prompt-gh-job-live.md` | P0 |
| 6 | `/research/gh/jobs/[id]/replay` | `next-prompt-gh-job-replay.md` | P1 |
| 7 | `/research/gh/findings/[id]` finding detail | `next-prompt-gh-finding-detail.md` | P0 |

### Wave 3 — Library management

| # | Page | Baton file | Priority |
|---|---|---|---|
| 8 | `/research/gh/saved-searches` | `next-prompt-gh-saved-searches.md` | P1 |
| 9 | `/research/gh/categories` | `next-prompt-gh-categories.md` | P1 |
| 10 | `/research/gh/weekly` digest + config | `next-prompt-gh-weekly.md` | P1 |

### Wave 4 — Promotions + health

| # | Page | Baton file | Priority |
|---|---|---|---|
| 11 | `/research/gh/send-to-planning` modal | `next-prompt-gh-send-to-planning.md` | P0 |
| 12 | `/research/gh/promote-to-rules` modal | `next-prompt-gh-promote-to-rules.md` | P0 |
| 13 | `/research/gh/health` on-demand suite | `next-prompt-gh-health.md` | P0 |

### Wave 5 — Docs (templates only — many similar pages)

| # | Page | Baton file | Priority |
|---|---|---|---|
| 14 | Docs page template | `next-prompt-docs-template.md` | P1 |

---

## States that every page must support

- **DATA** — populated, primary use case
- **EMPTY** — first-time / no data yet (e.g. zero jobs, zero saved searches, zero categories)
- **LOADING** — skeletons that approximate the final layout (no `Loading...` text alone)
- **ERROR** — error state with actionable recovery (retry button, support link)

Plus per-page:
- **Mobile variant** — every layout collapses to a single column with collapsible sidebar
- **Streaming** — live viewer, health dashboard need a streaming variant that progressively reveals content

---

## Capabilities consumed (by page)

| Page | Reads | Writes |
|---|---|---|
| `/sessions` | `GET /api/sessions?status=active` | — |
| `/sessions/[id]` | `useAgenticSession(id)` (ws) | — |
| `/research/gh` (Jobs tab) | `GET /api/research/gh/jobs` | — |
| `/research/gh` (Library tab) | `GET /api/research/gh/findings` (with facet filters) | — |
| `/research/gh` (Saved tab) | `GET /api/research/gh/saved-searches` | — |
| `/research/gh/new` | `GET /api/research/gh/categories` | `POST /api/research/gh/jobs`, `POST /api/research/gh/saved-searches` (save-as) |
| `/research/gh/jobs/[id]` (live) | `useAgenticSession(jobId)` (ws) + `GET /api/research/gh/jobs/:id` | `POST /api/research/gh/jobs/:id/feedback` |
| `/research/gh/jobs/[id]/replay` | `GET /api/sessions/:id/events?paginate` | — |
| `/research/gh/findings/[id]` | `GET /api/research/gh/findings/:id` + `GET /api/research/gh/findings/similar/:id` | `POST /api/research/gh/findings/:id/categories` |
| `/research/gh/saved-searches` | `GET /api/research/gh/saved-searches` | POST/PATCH/DELETE same |
| `/research/gh/categories` | `GET /api/research/gh/categories` | POST/PATCH/DELETE same |
| `/research/gh/weekly` | `GET /api/research/gh/jobs?mode=weekly-awareness` | `PATCH /api/research/gh/saved-searches/:id` (config) |
| `/research/gh/send-to-planning` | session findings | `POST /api/research/gh/jobs/:id/send-to-planning` |
| `/research/gh/promote-to-rules` | session findings + `GET /api/github/files` | `POST /api/research/gh/jobs/:id/promote-to-rules` |
| `/research/gh/health` | `GET /api/research/gh/health/runs` | `POST /api/research/gh/health/run` |

---

## Acceptance per page

Every page must:
- Use `<Navbar />` + collapsible `<Sidebar />` (no exceptions except modal-style flows)
- Be `dark` themed (`<html class="dark">`)
- Use Monolith chart palette for any chart
- Have sort + filter on any data table
- Have a tested EMPTY state (no fake data)
- Have a tested ERROR state (with retry)
- Be mobile-responsive (test at 375px, 768px, 1280px)
- Pass `pnpm typecheck`
