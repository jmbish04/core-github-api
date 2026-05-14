---
page: /sessions/[id]
title: "Standalone session transcript"
slug: session-transcript
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
    - "GET /api/sessions/:id"
    - "wss /api/sessions/:id/ws?token=..."
  writes:
    - "POST /api/sessions/:id/events (if user has publish grant)"
states_required: [DATA, EMPTY, LOADING, ERROR, STREAMING]
mobile_variant: true
---

## Section 1 — Goal

A direct view of one AgenticSession's transcript. Used for any non-feature session (raw Jules sessions, sprint sessions, HITL deliberations). Feature pages embed `<SessionTranscript>` as a component; this page is the *unwrapped* view.

## Section 2 — Layout

```
┌── Navbar ────────────────────────────────────────────────────┐
│ Session · {{kind}} · {{title}}                               │
│ status: ▶ active · 2 participants · started 14 min ago      │
└──────────────────────────────────────────────────────────────┘
┌── 2-column ──────────────────────────────────────────────────┐
│ ┌── Transcript (flex-1) ──────┐ ┌── Participants ────────┐ │
│ │ 14:02  system.start         │ │ ● user:justin (admin)   │ │
│ │ ──────────────────────────  │ │ ● agent:Research (pub)  │ │
│ │ 14:02  agent.action         │ │ ◯ agent:Learning (sub)  │ │
│ │   "starting search round 1" │ │                          │ │
│ │ ──────────────────────────  │ │ Grants                  │ │
│ │ 14:03  agent.result         │ │ [+ Add grant]           │ │
│ │   {found 12 candidates}     │ │                          │ │
│ │ ──────────────────────────  │ │                          │ │
│ │ [LIVE pulse ●]              │ │                          │ │
│ └─────────────────────────────┘ └──────────────────────────┘ │
│ [send-message input]                                          │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- `<SessionTranscript>` (the reusable transcript view)
- `<SessionEventCard>` for each entry
- `<ParticipantsRail>` (right side)
- shadcn `<Input>` + Button for publishing user messages
- shadcn `<Dialog>` for the add-grant flow
- `<CategoryChip>` for event type chips

## Section 4 — Data shape

```ts
type SessionEvent = {
  id: string;
  seq: number;
  type: 'system.start' | 'system.complete' | 'system.error' |
        'agent.thought' | 'agent.action' | 'agent.result' |
        'hitl.request' | 'hitl.response' |
        'jules.status' | 'jules.event' |
        'user.message';
  actor: string;  // "user:justin" | "agent:Research" | "jules:sess-xyz" | "system"
  payload: unknown;  // type-specific
  createdAt: number;
};
type Participant = {
  subscriberId: string;
  kind: 'user' | 'agent' | 'external';
  scope: 'subscribe' | 'publish' | 'admin';
  connected: boolean;
};
```

## Section 5 — States

- **DATA:** full transcript chronological; rich rendering per event type (thoughts in muted italic, actions in accent, results in success, errors in destructive).
- **EMPTY:** "Session has no events yet." Skeleton timeline.
- **LOADING:** 5 skeleton event cards.
- **ERROR:** banner "Lost connection" with auto-reconnect indicator (exponential backoff 1s, 2s, 4s, 8s, max 30s).
- **STREAMING:** new event cards fade in at bottom; auto-scroll if user is at bottom; if user has scrolled up, show a "↓ 3 new events" floating button.

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
```

## Section 7 — Mobile

Participants rail becomes a bottom-sheet accessible via "Participants (3)" button at top. Transcript fills viewport. Input bar sticks to bottom.

## Section 8 — Acceptance

- [ ] Uses only `@/components/ui/*` shadcn
- [ ] `aria-live="polite"` on the transcript region
- [ ] Auto-reconnect with exponential backoff on websocket close
- [ ] Publishing input is disabled if user lacks `publish` grant; visible reason in tooltip
- [ ] Add-grant dialog validates subject format
- [ ] Mobile variant at 375px tested
