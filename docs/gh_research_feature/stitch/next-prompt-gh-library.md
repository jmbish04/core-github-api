---
page: /research/gh
title: "Research library"
slug: gh-library
priority: P0
wave: 2
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/jobs"
    - "GET /api/research/gh/findings (with facet filters)"
    - "GET /api/research/gh/saved-searches"
    - "GET /api/research/gh/categories"
  writes: []
peer_pages: [/research/gh/new, /research/gh/jobs/[id], /research/gh/findings/[id]]
states_required: [DATA, EMPTY, LOADING, ERROR]
mobile_variant: true
---

## Section 1 — Goal

The user's compounding knowledge base. Three tabs: **Jobs** (history of every research run), **Library** (curated findings, the killer view), **Saved Searches** (re-runnable templates). The library tab is what makes the feature worth using — full-text + vector + facet filtering across every finding ever produced.

## Section 2 — Layout

```
┌── Navbar ────────────────────────────────────────────────────┐
│ Research Library                          [+ New Research]   │
│ Curated knowledge from your GitHub research                   │
└──────────────────────────────────────────────────────────────┘
┌── Sidebar ──┐ ┌── Main ────────────────────────────────────┐
│ Library ●   │ │ [Jobs] [Library] [Saved Searches]            │
│ Sessions    │ │                                              │
│ Settings    │ │ ┌── Facets ──┐ ┌── Results (grid) ────────┐ │
│ Docs        │ │ │ Categories │ │ [card] [card] [card]      │ │
│             │ │ │ ☐ #cf-sdk  │ │ [card] [card] [card]      │ │
│             │ │ │ ☐ #shadcn  │ │ [card] [card] [card]      │ │
│             │ │ │            │ │                            │ │
│             │ │ │ Source     │ │ Load more ↓                │ │
│             │ │ │ ☐ repo     │ │                            │ │
│             │ │ │ ☐ web-page │ │                            │ │
│             │ │ │            │ │                            │ │
│             │ │ │ Fitness    │ │                            │ │
│             │ │ │ ☐ fit      │ │                            │ │
│             │ │ │ ☐ partial  │ │                            │ │
│             │ │ │            │ │                            │ │
│             │ │ │ Date       │ │                            │ │
│             │ │ │ [7/30/all] │ │                            │ │
│             │ │ │            │ │                            │ │
│             │ │ │ [Find sim] │ │                            │ │
│             │ │ └────────────┘ └────────────────────────────┘ │
└─────────────┘ └────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<Tabs>` (Jobs / Library / Saved Searches)
- Facet sidebar: `<Checkbox>` lists, `<Select>` for date range, `<Input>` for similar-finding url
- Results grid: 3-column on desktop, 2-column tablet, 1-column mobile
- `<SourceCard>` (custom — see DESIGN §7.1)
- `<CategoryChip>` (custom — see DESIGN §7.6)
- shadcn `<Input>` for global search (top-right of the tab content area)

## Section 4 — Data shape

```ts
type LibraryFinding = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobMode: 'on-demand' | 'pre-planning' | 'weekly-awareness';
  url: string;
  title: string;
  summary: string;
  sourceType: 'github-repo' | 'web-page' | 'github-issue' | 'github-pr';
  relevanceScore: number | null;
  fitnessLabel: 'fit' | 'partial' | 'miss' | null;
  categories: { id: string; name: string; color: string }[];
  createdAt: number;
};
type JobRow = {
  id: string;
  mode: 'on-demand' | 'pre-planning' | 'weekly-awareness';
  initialPrompt: string;
  status: 'queued' | 'running' | 'synthesizing' | 'complete' | 'failed';
  sourceCount: number;
  durationMs: number | null;
  createdAt: number;
};
type SavedSearchRow = {
  id: string;
  name: string;
  mode: string;
  prompt: string;
  scheduleCron: string | null;
  lastRunAt: number | null;
};
```

## Section 5 — States

- **DATA:** Library tab default; populated grid; facets show counts.
- **EMPTY:** "Your library is empty. Run your first research to start collecting findings." CTA → `/research/gh/new`.
- **LOADING:** 9 skeleton SourceCards.
- **ERROR:** red banner + retry; facets disabled.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Sidebar hamburger. Facet sidebar becomes a filter sheet (slide-up). Results collapse to 1-column. Top-right action button (`+ New Research`) moves to floating action button (FAB).

## Section 8 — Acceptance

- [ ] `@/components/ui/*` only
- [ ] Three tabs functional; query params preserve tab state
- [ ] Facet filters update URL (sharable links)
- [ ] Sort by date / relevance / fitness
- [ ] Empty + Error states match Section 5
- [ ] Find-similar input accepts a finding URL or id and routes to `/research/gh/findings/{id}` with prefilled similar query
