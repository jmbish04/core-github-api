---
page: /research/gh/findings/[id]
title: "Finding detail"
slug: gh-finding-detail
priority: P0
wave: 2
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/findings/:id"
    - "GET /api/research/gh/findings/similar/:id"
  writes:
    - "POST /api/research/gh/findings/:id/categories"
    - "POST /api/research/gh/jobs/:jobId/feedback (re-rate fitness)"
peer_pages: [/research/gh, /research/gh/jobs/[id], /research/gh/send-to-planning, /research/gh/promote-to-rules]
states_required: [DATA, LOADING, ERROR]
mobile_variant: true
---

## Section 1 — Goal

Drill into one finding: its full inspection blob (loaded from R2), the code excerpts the agent extracted, the patterns detected, and one-click actions to send-to-planning or promote-to-rules. Also: "find similar in library" — the vector search killer feature.

## Section 2 — Layout

```
┌── Navbar ────────────────────────────────────────────────────┐
│ ◀ Job · cloudflare/agents-sdk-examples                        │
└──────────────────────────────────────────────────────────────┘
┌── 2-column ──────────────────────────────────────────────────┐
│ ┌── Main ──────────────────┐ ┌── Side ──────────────────┐    │
│ │ Title + url + score      │ │ Actions                   │    │
│ │ Summary (long-form)      │ │ [Send → Planning]         │    │
│ │                          │ │ [Promote → Rule]          │    │
│ │ Patterns detected:       │ │                            │    │
│ │ • Skill loading pattern  │ │ Categories                 │    │
│ │ • Peer-binding healthchk │ │ [#agents] [#skills] [+]   │    │
│ │                          │ │                            │    │
│ │ Code excerpts:           │ │ Fitness                    │    │
│ │ ┌─ file/path.ts:42 ──┐  │ │ ◯ ● ◯                      │    │
│ │ │ class Foo extends   │  │ │                            │    │
│ │ │   BaseAgent {       │  │ │ Similar findings           │    │
│ │ │   skills = […]      │  │ │ • cf/agents-starter        │    │
│ │ │ }                   │  │ │ • honojs/hono              │    │
│ │ └─────────────────────┘  │ │ • microsoft/agents-sdk     │    │
│ │                          │ │                            │    │
│ └──────────────────────────┘ └────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<Card>` for content sections
- `<SyntaxHighlight>` (via react-syntax-highlighter, OKLCH-themed)
- `<CategoryChip>` editor (add/remove)
- shadcn `<ToggleGroup>` for fitness tri-state
- `<SourceCard>` (compact variant) for similar findings list

## Section 4 — Data shape

```ts
type FindingDetail = {
  id: string;
  jobId: string;
  url: string;
  title: string;
  summary: string;
  sourceType: string;
  relevanceScore: number;
  fitnessLabel: 'fit' | 'partial' | 'miss' | null;
  inspection: {
    patternsDetected: string[];
    keyFiles: { path: string; reason: string }[];
    codeExcerpts: { path: string; line: number; snippet: string; language: string }[];
    confidence: number;
  };
  categories: { id: string; name: string; color: string }[];
  vectorId: string | null;
  createdAt: number;
};
type SimilarFinding = { id: string; title: string; url: string; score: number };
```

## Section 5 — States

- **DATA:** all sections populated.
- **LOADING:** skeleton cards.
- **ERROR:** banner + retry.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Side rail becomes a bottom sheet "Actions" button. Code excerpts horizontally scrollable on overflow.

## Section 8 — Acceptance

- [ ] Code blocks syntax-highlight with OKLCH palette + monospace
- [ ] Send-to-planning + promote-to-rules open shadcn `<Dialog>`-based flows
- [ ] Similar findings list is empty-state-aware ("No similar findings yet — library is small")
- [ ] Categories editor uses combobox with create-on-the-fly
- [ ] Fitness change emits feedback POST + optimistic update
