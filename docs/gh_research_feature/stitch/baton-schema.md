# Baton Schema

Each `next-prompt-*.md` file in this folder is a "baton" — a self-contained briefing for Stitch (mockup generation) and Jules (React rebuild) for one page.

The format is YAML frontmatter + Markdown body.

---

## Frontmatter (required)

```yaml
---
page: /research/gh/jobs/[id]                # the Astro route
title: "Live job viewer"                    # human label
slug: gh-job-live                           # used in branch names / file ids
priority: P0                                # P0 / P1 / P2
wave: 2                                     # which generation wave
orchestration: current-agent                # current-agent | jules (per Stitch loop Step 0)
stitch_project_id: 15817277816175746502     # Core GitHub API - Repo Dashboard
design_theme:
  mode: DARK
  font: INTER
  radius: ROUND_EIGHT
  brand_color: "#ffffff"
  saturation: 1
capabilities_consumed:
  reads:
    - "GET /api/research/gh/jobs/:id"
    - "wss /api/sessions/:id/ws"
  writes:
    - "POST /api/research/gh/jobs/:id/feedback"
peer_pages:
  - /research/gh/jobs/[id]/replay
  - /research/gh/findings/[id]
states_required:
  - DATA
  - EMPTY
  - LOADING
  - ERROR
  - STREAMING
mobile_variant: true
---
```

---

## Body (required sections in order)

### Section 1 — Goal

One paragraph. What is this page for. What is the user trying to accomplish here.

### Section 2 — Layout

ASCII sketch of the desktop layout. Three columns, two columns, single column. Where the navbar is. Where the sidebar is. Approximate widths.

### Section 3 — Components used

Bulleted list of shadcn primitives and feature components:
- `<Card>`, `<Tabs>`, `<Dialog>`, etc.
- Custom: `<SessionTranscript>`, `<SourceCard>`, `<CategoryChip>`, etc.

### Section 4 — Data shape

The TypeScript types this page consumes (inferred from `services/agentic-session/types.ts`, `db/schemas/research/gh/*`, etc.). Be specific — don't paraphrase.

### Section 5 — States

For each state in `states_required`, describe what's shown:

```
DATA: full live transcript, source cards in right rail, rounds in left rail, etc.
EMPTY: "No events yet — the agent is starting up" with skeleton timeline
LOADING: skeleton rows in transcript, ghost cards in right rail
ERROR: red banner with retry; preserve any events already received
STREAMING: new events fade in from bottom; auto-scroll if user is at bottom
```

### Section 6 — Design block (verbatim)

Copy this block VERBATIM into every baton (it's the Stitch instruction):

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
notes: |
  Dark shadcn surface; no traditional borders; ring-1 + divide-y + bg-card only.
  OKLCH chart palette per DESIGN.md §2.
  Inter for UI; JetBrains Mono for code.
  Library/research feel: librarian, methodical, transparent. No emoji.
  Always navbar; always mobile-responsive with collapsible sidebar.
  Every data table is sortable + filterable.
```

### Section 7 — Mobile variant

ASCII sketch of how it stacks at <768px. Which elements collapse, which become accordions, which disappear behind hamburger menus.

### Section 8 — Acceptance criteria

Bulleted checklist for the React rebuilder:
- [ ] Uses only `@/components/ui/*` shadcn imports (no lookalikes)
- [ ] All four required states implemented and visually distinct
- [ ] `aria-live="polite"` on streaming surfaces
- [ ] Keyboard navigation works for primary actions
- [ ] Mobile variant matches Section 7 at 375px
- [ ] Vitest snapshot for the DATA state
- [ ] Page renders inside the Astro layout with no console errors

---

## How to use this schema

1. **Stitch step:** copy the frontmatter + Section 6 design block into `mcp__stitch__generate_screen_from_text` call. Stitch returns HTML + PNG. Iterate until the mockup matches Sections 1–5.
2. **Review step (current-agent):** look at the PNG; compare to all states in Section 5. If gaps, send a surgical follow-up Stitch prompt.
3. **Jules rebuild step:** when the mockup is stable, the entire baton file (plus the generated HTML mockup attached) becomes input to a Jules session. Jules rebuilds in React+Astro+shadcn, mirroring AGENTS.md conventions.
4. **Acceptance:** the orchestrator reviews against Section 8 before merging the PR.
