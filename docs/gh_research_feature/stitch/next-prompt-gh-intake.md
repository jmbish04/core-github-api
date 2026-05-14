---
page: /research/gh/new
title: "Research intake"
slug: gh-intake
priority: P0
wave: 2
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/categories"
  writes:
    - "POST /api/research/gh/jobs"
    - "POST /api/research/gh/saved-searches"
peer_pages: [/research/gh, /research/gh/jobs/[id]]
states_required: [DATA, LOADING, ERROR]
mobile_variant: true
---

## Section 1 — Goal

Submit a research request. Three modes with distinct form fields. The form should make the *cost/time tradeoff* of each mode obvious — on-demand is fast and cheap, weekly is expensive but compounds.

## Section 2 — Layout

```
┌── Navbar ────────────────────────────────────────────────────┐
│ New Research                                                  │
└──────────────────────────────────────────────────────────────┘
┌── Mode tabs ─────────────────────────────────────────────────┐
│ [On-demand] [Pre-planning] [Weekly]                          │
│  3 min          15 min        30 min · runs Mondays           │
│  Quick survey   Deep research Recurring digest                │
└──────────────────────────────────────────────────────────────┘
┌── Form ──────────────────────────────────────────────────────┐
│ Prompt                                                        │
│ [multiline textarea, 5 rows, placeholder: "What patterns are │
│  others using for X?"]                                        │
│                                                               │
│ Options (collapsed by default)                                │
│ ▸ Breadth: 5  · Depth: 1  · Top-K repos: 3  · Email: off     │
│                                                               │
│ Categories to favor                                           │
│ [+ #cloudflare-workers]  [+ #shadcn]  [+ Add category]       │
│                                                               │
│ Save as saved search? [☐]  Name: [_______________]            │
│ Schedule cron (optional): [______________________]            │
│                                                               │
│ [Cancel]                              [Start research →]     │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<Tabs>` for mode selection (with mode summary under tab labels)
- shadcn `<Textarea>` for prompt
- shadcn `<Collapsible>` for advanced options
- shadcn `<NumberInput>` (or `<Input type=number>`) for breadth/depth
- shadcn `<Switch>` for email-on-complete toggle
- shadcn `<MultiSelect>` for categories (auto-complete from `GET /api/research/gh/categories`)
- shadcn `<Input>` for save-as-saved-search name + cron expression
- shadcn `<Button>` primary + secondary

## Section 4 — Data shape (form payload)

```ts
type IntakePayload = {
  mode: 'on-demand' | 'pre-planning' | 'weekly-awareness';
  prompt: string;
  options: {
    breadth?: number;
    depth?: number;
    topK?: number;
    emailOnComplete?: boolean;
    julesSynthesis?: boolean;  // forced true for pre-planning + weekly
    categoryIds?: string[];
  };
  saveAsSavedSearch?: { name: string; scheduleCron?: string };
};
```

## Section 5 — States

- **DATA:** all fields populated with mode-specific defaults; submit enabled when prompt ≥ 10 chars.
- **LOADING:** submit button shows spinner + label "Starting research…"; form disabled.
- **ERROR:** inline error under submit button with structured message ("GITHUB_TOKEN missing — check secrets").

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Tabs become a `<Select>` mode picker. Form stacks vertically. Submit button sticks to bottom of viewport.

## Section 8 — Acceptance

- [ ] Mode-switch updates defaults atomically (breadth/depth/budget)
- [ ] Pre-planning + weekly modes force `julesSynthesis=true` and disable the toggle with a tooltip
- [ ] Cron validator catches invalid expressions
- [ ] Submit POSTs and redirects to `/research/gh/jobs/{jobId}` immediately (do not wait for completion)
- [ ] Save-as-saved-search creates the saved search atomically with the first job run
- [ ] @/components/ui/* only
