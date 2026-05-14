---
page: /research/gh/promote-to-rules
title: "Promote findings to rules"
slug: gh-promote-to-rules
priority: P0
wave: 4
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/findings (selected ids)"
    - "GET /api/github/files?path=AGENTS.md"
    - "GET /api/github/files?path=.agent/rules/"
  writes:
    - "POST /api/research/gh/jobs/:id/promote-to-rules"
peer_pages: [/research/gh/jobs/[id]]
states_required: [DATA, LOADING, ERROR, PREVIEW]
mobile_variant: true
---

## Section 1 — Goal

Take 1–N findings and synthesize them into a new rule entry, appended to a chosen target file (`AGENTS.md` or `.agent/rules/<scope>.md`). The agent generates the rule text; the user reviews the diff; on approval, the system opens a PR with provenance footer.

## Section 2 — Layout

```
┌── Navbar (with × close) ─────────────────────────────────────┐
│ Promote findings to rules                                     │
└──────────────────────────────────────────────────────────────┘
┌── 2-column ──────────────────────────────────────────────────┐
│ ┌── Form ──────────────────┐ ┌── Diff preview ───────────┐   │
│ │ Target file               │ │  AGENTS.md                │   │
│ │ ○ AGENTS.md               │ │                            │   │
│ │ ● .agent/rules/cf-sdk.md  │ │ ## Skill loading pattern  │   │
│ │ ○ New rule file…          │ │ + (existing content...)   │   │
│ │                           │ │ +                          │   │
│ │ Selected findings (3)     │ │ + ### New rule             │   │
│ │ • cf/agents-sdk           │ │ + When loading skills in   │   │
│ │ • honojs/hono             │ │ + an Agent subclass, ...   │   │
│ │ • microsoft/agents-sdk    │ │ + <!-- provenance: job   │   │
│ │                           │ │ +   xyz, sources a,b,c -->│   │
│ │ Notes (optional)          │ │                            │   │
│ │ [textarea]                │ │ [Regenerate]               │   │
│ │                           │ │                            │   │
│ │ [Cancel] [Generate diff]  │ │                            │   │
│ │           [Open PR →]     │ │                            │   │
│ └───────────────────────────┘ └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<RadioGroup>` for target file selection
- shadcn `<Input>` for "new rule file" path entry (revealed by third radio option)
- `<SyntaxHighlight>` for the diff preview (diff language)
- shadcn `<Button>` primary + secondary + tertiary (Regenerate)

## Section 4 — Data shape

```ts
type PromoteToRulesPayload = {
  jobId: string;
  findingIds: string[];
  targetFilePath: string;  // 'AGENTS.md' | '.agent/rules/<name>.md'
  notes?: string;
};
type PromoteToRulesPreview = {
  proposedDiff: string;       // unified diff format
  newRuleMarkdown: string;
  targetFilePath: string;
};
type PromoteToRulesResponse = {
  pullRequestUrl: string;
  branch: string;
};
```

## Section 5 — States

- **DATA:** form ready; Generate-diff button enabled when target chosen.
- **PREVIEW:** diff visible; Open-PR button enabled; Regenerate spins the AI again with different sampling.
- **LOADING:** generate-diff or open-PR in flight.
- **ERROR:** inline error; preserve form state.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Single column. Diff preview collapses to a "Show diff" button revealing a sheet.

## Section 8 — Acceptance

- [ ] Generate-diff fires `POST /api/research/gh/jobs/:id/promote-to-rules?dryRun=true` to get the preview
- [ ] Open-PR fires the same endpoint with `?dryRun=false`
- [ ] Generated rule includes provenance footer (job id + source ids) every time
- [ ] Regenerate offers different sampling (visible param: temperature toggle)
- [ ] On success, navigate to PR URL in new tab and show toast with PR link
- [ ] @/components/ui/* only
