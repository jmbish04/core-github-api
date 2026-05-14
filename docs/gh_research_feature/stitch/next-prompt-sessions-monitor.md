---
page: /sessions
title: "Global sessions monitor"
slug: sessions-monitor
priority: P0
wave: 1
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme:
  mode: DARK
  font: INTER
  radius: ROUND_EIGHT
  brand_color: "#ffffff"
  saturation: 1
capabilities_consumed:
  reads:
    - "GET /api/sessions?status=active"
    - "GET /api/sessions?status=complete&limit=20"
  writes: []
peer_pages:
  - /sessions/[id]
states_required: [DATA, EMPTY, LOADING, ERROR]
mobile_variant: true
---

## Section 1 — Goal

A single place to see *every* agentic operation the worker has run or is running right now. The user comes here to verify that work is happening, to peek into a Jules session, or to find a past session to re-open. It's the worker's "control tower."

## Section 2 — Layout (desktop)

```
┌── Navbar ────────────────────────────────────────────────────┐
│ Sessions                                                     │
└──────────────────────────────────────────────────────────────┘
┌── Sidebar ──┐ ┌── Main ────────────────────────────────────┐
│ Library     │ │  Sessions                                   │
│ Sessions ●  │ │  All agentic sessions across the worker.    │
│ Settings    │ │                                              │
│ Docs        │ │  [Search…]  [Status ▾] [Kind ▾]  [refresh]  │
│             │ │                                              │
│             │ │  ▾ Active (3)                                │
│             │ │  ┌────────────────────────────────────────┐ │
│             │ │  │ gh-research · "smart home patterns"    │ │
│             │ │  │ 4 min ago · round 2/3 · 2 participants│ │
│             │ │  │ pulse-dot ●                             │ │
│             │ │  └────────────────────────────────────────┘ │
│             │ │  ┌────────────────────────────────────────┐ │
│             │ │  │ jules · session 8204…                   │ │
│             │ │  │ 12 min ago · status: ready_for_pr      │ │
│             │ │  └────────────────────────────────────────┘ │
│             │ │                                              │
│             │ │  ▸ Complete (last 20)                        │
│             │ │  ▸ Failed (last 5)                           │
│             │ │                                              │
└─────────────┘ └────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<Tabs>` (Active / Complete / Failed)
- shadcn `<Card>` per session row (clickable → /sessions/[id])
- shadcn `<Input>` for search, `<Select>` for status + kind filters
- shadcn `<Badge>` for session kind chips (gh-research / jules / sprint / hitl-deliberation / generic)
- Live pulse dot animation on Active items
- Empty state: large icon + "No sessions running. Start one from Library or Intake."

## Section 4 — Data shape

```ts
type SessionRow = {
  id: string;                   // uuid
  kind: 'gh-research' | 'jules' | 'sprint' | 'hitl-deliberation' | 'generic';
  title: string;
  status: 'active' | 'paused' | 'complete' | 'aborted';
  summary: string | null;       // live one-liner
  ownerUserId: string | null;
  participantsCount: number;
  lastEventAt: number;          // epoch seconds
  createdAt: number;
};
```

## Section 5 — States

- **DATA:** sections expanded by default for Active; Complete/Failed collapsed. Hovering a row reveals chevron `>`.
- **EMPTY:** centered illustration (subtle, not cute) + headline "No sessions yet" + body "Sessions appear here when an agentic operation starts. Try starting one from the Library." + CTA button → `/research/gh/new`.
- **LOADING:** 3 skeleton rows in the Active section with pulsing accent dot placeholders.
- **ERROR:** red banner "Couldn't load sessions" + retry button + link to /docs/agentic-session/troubleshooting.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
notes: |
  Dark shadcn surface; no traditional borders; ring-1 + divide-y + bg-card only.
  OKLCH chart palette per DESIGN.md §2. Inter for UI; JetBrains Mono for code.
  Library/research feel: librarian, methodical, transparent. No emoji.
  Always navbar; always mobile-responsive with collapsible sidebar.
  Every data table is sortable + filterable.
```

## Section 7 — Mobile (<768px)

Sidebar collapses behind hamburger. Sections stack. Filter row becomes a sticky toolbar. Session cards become full-width with smaller text.

## Section 8 — Acceptance

- [ ] Imports only from `@/components/ui/*`
- [ ] All four states render distinctly
- [ ] `aria-live="polite"` on the Active section header announcing count changes
- [ ] Auto-refreshes via websocket subscription to system-wide session events (or polls every 5s as fallback)
- [ ] Mobile variant tested at 375px
- [ ] Page render < 200ms on cached data
