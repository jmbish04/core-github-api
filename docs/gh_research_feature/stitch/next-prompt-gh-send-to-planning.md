---
page: /research/gh/send-to-planning
title: "Send findings to planning"
slug: gh-send-to-planning
priority: P0
wave: 4
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/findings (selected ids)"
  writes:
    - "POST /api/research/gh/jobs/:id/send-to-planning"
peer_pages: [/planning, /research/gh/jobs/[id]]
states_required: [DATA, LOADING, ERROR]
mobile_variant: true
---

## Section 1 — Goal

A modal-style flow (full page on mobile) where the user enters project context for the OrchestratorAgent and submits selected findings as a planning brief. The output is a brief id that opens in the existing `/planning` view.

## Section 2 — Layout

```
┌── Navbar (with × close) ─────────────────────────────────────┐
│ Send findings to planning                                     │
└──────────────────────────────────────────────────────────────┘
┌── 2-column ──────────────────────────────────────────────────┐
│ ┌── Form ──────────────────┐ ┌── Selected findings (3) ──┐   │
│ │ Project title            │ │ ┌──────────────────────┐  │   │
│ │ [_________________]      │ │ │ cf/agents-sdk        │  │   │
│ │                          │ │ │ Skill loading...     │  │   │
│ │ Project context          │ │ └──────────────────────┘  │   │
│ │ [multiline 8 rows]       │ │ ┌──────────────────────┐  │   │
│ │ "What are you building?  │ │ │ honojs/hono          │  │   │
│ │  What constraints?"      │ │ │ Middleware pattern.. │  │   │
│ │                          │ │ └──────────────────────┘  │   │
│ │ Scope hints (optional)   │ │ ┌──────────────────────┐  │   │
│ │ [_________________]      │ │ │ shadcn-ui/ui         │  │   │
│ │                          │ │ │ Theme tokens...      │  │   │
│ │ [Cancel] [Send brief →]  │ │ └──────────────────────┘  │   │
│ └──────────────────────────┘ │ [+ Add more]              │   │
│                              └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<Input>` title, `<Textarea>` context, `<Textarea>` scope hints
- shadcn `<Card>` for each selected finding (compact, removable)
- shadcn `<Button>` primary + secondary
- Sticky form footer

## Section 4 — Data shape

```ts
type SendToPlanningPayload = {
  jobId: string;
  findingIds: string[];
  projectTitle: string;
  projectContext: string;
  scopeHints?: string;
};
type SendToPlanningResponse = {
  briefId: string;
  briefUrl: string;  // route to /planning/[id]
};
```

## Section 5 — States

- **DATA:** form ready; submit enabled when title ≥ 3 chars AND context ≥ 50 chars.
- **LOADING:** submit spinner; "Sending brief to Orchestrator…"; ~2-5s wait expected.
- **ERROR:** inline error + retry; preserve form state.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Single column. Selected findings collapse to a accordion. Submit button sticky bottom.

## Section 8 — Acceptance

- [ ] Validates title + context lengths before enabling submit
- [ ] On submit, navigates to `/planning/{briefId}` on success
- [ ] Cancel returns to previous page (`router.back()`)
- [ ] Removing a finding updates the count and persists across navigation (URL contains finding ids)
- [ ] @/components/ui/* only
