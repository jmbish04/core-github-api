---
page: /research/gh/health
title: "On-demand health suite"
slug: gh-health
priority: P0
wave: 4
orchestration: current-agent
stitch_project_id: 15817277816175746502
design_theme: { mode: DARK, font: INTER, radius: ROUND_EIGHT, brand_color: "#ffffff", saturation: 1 }
capabilities_consumed:
  reads:
    - "GET /api/research/gh/health/runs"
  writes:
    - "POST /api/research/gh/health/run"
peer_pages: [/docs/research/health]
states_required: [DATA, EMPTY, LOADING, ERROR, RUNNING]
mobile_variant: true
---

## Section 1 — Goal

Verify the entire gh-research pipeline with one click. 16 checks (sandbox provisioning through end-to-end micro-job). **On-demand only — never on a cron** because the suite is expensive (real Jules ping, real repo clone, real email send).

## Section 2 — Layout

```
┌── Navbar ────────────────────────────────────────────────────┐
│ Health Suite (on-demand)                                      │
│ ⚠ Each run costs ~$0.05 in real resources. Never on a cron.  │
└──────────────────────────────────────────────────────────────┘
┌── Top action ────────────────────────────────────────────────┐
│ [Run health suite] (opens confirm dialog)                     │
└──────────────────────────────────────────────────────────────┘
┌── Live results (when running) ───────────────────────────────┐
│ ● Sandbox provisioning round-trip          PASS  124ms       │
│ ● Git clone reachability                   PASS  4.2s        │
│ ● Filesystem read                          PASS  18ms        │
│ ● ripgrep available                        PASS  6ms         │
│ ● GitHub API rate-limit > 100              PASS                │
│ ● gh search repos                          PASS  220ms       │
│ ● Browser Render API                       PASS  1.1s        │
│ ● Jules SDK auth                           PASS                │
│ ● JulesResearchWorkflow.create             PASS  88ms        │
│ ● Email send dry-run                       PASS                │
│ ● D1 SELECT 1                              PASS  4ms         │
│ ● Vectorize query                          PASS  41ms        │
│ ● R2 put/get/delete                        PASS  62ms        │
│ ● AI Gateway short prompt                  PASS  890ms       │
│ ● Peer agent bindings                      PASS  3ms         │
│ ◐ End-to-end micro-job                     RUNNING…           │
└──────────────────────────────────────────────────────────────┘
┌── History (recent 20 runs) ──────────────────────────────────┐
│ table with: when · who triggered · overall · duration · diff │
└──────────────────────────────────────────────────────────────┘
```

## Section 3 — Components

- shadcn `<AlertDialog>` for "Run suite?" confirm (cost warning)
- shadcn `<Card>` for each check row
- Status icons: pass=success-tinted check, fail=destructive-tinted X, warn=warning-tinted bang, running=spinner
- shadcn `<Table>` for history with sort + filter
- shadcn `<Alert variant="warning">` at top describing cost

## Section 4 — Data shape

```ts
type HealthCheck = {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'running' | 'pending';
  message?: string;
  durationMs?: number;
};
type HealthRun = {
  id: string;
  triggeredBy: string;
  overallStatus: 'pass' | 'warn' | 'fail';
  checks: HealthCheck[];
  durationMs: number;
  createdAt: number;
};
```

## Section 5 — States

- **DATA:** showing history; no run active.
- **EMPTY:** "No health runs yet. Click Run to see system status." illustration.
- **LOADING:** loading history.
- **ERROR:** banner + retry.
- **RUNNING:** live results streaming via session events (each check is a session event); overall progress ring at top.

## Section 6 — Design block

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
```

## Section 7 — Mobile

Check rows full-width. History table becomes card list.

## Section 8 — Acceptance

- [ ] Run-suite button shows shadcn `<AlertDialog>` with cost warning before posting
- [ ] During RUNNING state, results stream live via AgenticSession (same transcript infra)
- [ ] Each check has its own pass/fail icon (no global "checking..." text)
- [ ] History row clicked → expands inline showing the full checks array (no separate page)
- [ ] Email-dry-run toggle visible (default ON dry-run; OFF actually sends a `[health-check]` email)
- [ ] @/components/ui/* only
