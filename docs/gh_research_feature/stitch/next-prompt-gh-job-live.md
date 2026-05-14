---
page: /research/gh/jobs/[id]
title: "Live job viewer"
slug: gh-job-live
priority: P0
wave: 2
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/jobs/:id"
    - "wss /api/sessions/:id/ws"
  writes:
    - "POST /api/research/gh/jobs/:id/feedback"
peer_pages: [/research/gh/jobs/[id]/replay, /research/gh/findings/[id], /research/gh/send-to-planning, /research/gh/promote-to-rules]
states_required: [DATA, EMPTY, LOADING, ERROR, STREAMING]
mobile_variant: true
---

## Section 1 — Goal

THE marquee page. The user watches their research librarian work in real time — rounds, queries, repos cloned, files read, reflections, refined queries. Every step published as a `session_event`, rendered as it arrives. This is the page that turns the worker into something delightful to *watch*.

## Section 2 — Layout

```
┌── Navbar ────────────────────────────────────────────────────┐
│ ◀ Library · "smart home patterns" · pre-planning · ▶ active │
│ progress: ●●●○○ round 2/3 · ETA 6 min                       │
└──────────────────────────────────────────────────────────────┘
┌── 3-column ──────────────────────────────────────────────────┐
│ ┌── Rounds ──┐ ┌── Transcript ────────┐ ┌── Sources ──────┐ │
│ │ ● Round 1  │ │ 14:02 system.start    │ │ ┌──────────────┐│ │
│ │   2 min    │ │ ─────────────────────  │ │ │ cf/agents-sdk││ │
│ │   8 events │ │ 14:02 agent.action    │ │ │ score 0.91   ││ │
│ │            │ │  "seed-query-gen"     │ │ │ fit ◯ ● ◯    ││ │
│ │ ● Round 2  │ │ ─────────────────────  │ │ └──────────────┘│ │
│ │   active   │ │ 14:03 agent.result    │ │ ┌──────────────┐│ │
│ │   ●pulse   │ │  3 candidate repos    │ │ │ honojs/hono  ││ │
│ │            │ │ ─────────────────────  │ │ │ score 0.86   ││ │
│ │ ◯ Round 3  │ │ 14:04 sandbox.clone   │ │ │ fit ● ◯ ◯    ││ │
│ │   pending  │ │  cf/agents-sdk depth=1│ │ └──────────────┘│ │
│ │            │ │ ─────────────────────  │ │  [Send → Plan] │ │
│ │            │ │ 14:05 sandbox.grep    │ │  [Promote rule]│ │
│ │            │ │  17 hits in 6 files   │ │                  │ │
│ │            │ │ [LIVE pulse ●]        │ │                  │ │
│ │            │ └───────────────────────┘ └──────────────────┘ │
└─────────────┘                                                 │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- `<SessionTranscript>` (the reusable component, filtered to this job's session)
- `<RoundsTimeline>` (custom — see DESIGN §7.3)
- `<SourceCard>` (custom — see DESIGN §7.1) with fitness thumbs
- shadcn `<Progress>` for top progress ring
- shadcn `<Button>` for Send-to-Planning / Promote-to-Rules CTAs
- `<ParticipantsPopover>` (clickable participant count)
- `<LibrarianThinking>` indicator inside transcript when next event hasn't arrived in 3s

## Section 4 — Data shape

```ts
type Job = { /* gh_research_jobs row from PRD §10 */ };
type SessionEvent = { /* see PRD §4.1 */ };
type Source = {
  id: string;
  url: string;
  title: string;
  summary: string;
  sourceType: string;
  relevanceScore: number;
  fitnessLabel: 'fit' | 'partial' | 'miss' | null;
  round: number;
};
```

## Section 5 — States

- **DATA:** full live view; all three columns populated.
- **EMPTY:** "Waiting for events. Your research is starting up." with skeleton.
- **LOADING:** initial websocket-connection wait; 5 skeleton events.
- **ERROR:** banner with reconnect indicator; existing events preserved.
- **STREAMING:** every new event animates in. Auto-scroll if user at bottom; otherwise show "↓ 3 new events" floating button. Pulse-dot on Active round.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Three columns collapse: Rounds → accordion at top; Sources → bottom sheet "Sources (12)" button; Transcript fills viewport. Floating action buttons for Send-to-Planning / Promote-to-Rules at bottom-right.

## Section 8 — Acceptance

- [ ] @/components/ui/* only; uses `<SessionTranscript>` from `/views/session`
- [ ] aria-live polite on transcript
- [ ] Fitness thumbs write `POST /api/research/gh/jobs/:id/feedback` and optimistic-update
- [ ] Multi-select on source cards activates a floating action bar with Send/Promote buttons
- [ ] Completed jobs: replay button visible in navbar bar
- [ ] No `Loading...` solo strings — every loading state names what's loading
