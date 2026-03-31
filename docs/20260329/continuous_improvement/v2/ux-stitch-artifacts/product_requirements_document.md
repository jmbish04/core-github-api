# PRD: Agentic Sentinality — The Agent Meta-Governance & Fleet Immune System

**Document Type:** Product Requirements Document
**Version:** 2.3 — BabysitterAgent folded into JulesOverseer; component map updated to canonical backlog tables
**Date:** 2026-03-31
**Project ID:** `proj-sentinel-001`
**Status:** Approved for Implementation

---

## 1. Executive Summary

`Agentic Sentinality` is a command-and-control meta-governance platform that eliminates the **"repetition tax"** paid when AI agents make recurring architectural errors. It operates as a closed-loop immune system:

1. **Extracts** insights from raw conversation histories (Jules sessions, PR comments, Stitch prompts)
2. **Validates** patterns against Cloudflare documentation via grounding
3. **Prevents** re-attempts of previously-failed fixes via the Contemplation Gate
4. **Intervenes** in real-time when Jules agents enter Doom Loops via `JulesOverseer` (Babysitter capability)
5. **Intercepts** PRs before merge to post human-persona remediation instructions

Once a lesson is learned by one agent, it is permanently encoded in the fleet's immune memory.

---

## 2. Problem Statement

### 2.1 The Doom Loop / Apology Cycle

AI coding agents (Jules, Stitch) are **fundamentally stateless across sessions**. This creates the **Light Switch Anti-Pattern**: a fix is proposed, merged, reverted, then proposed again — indefinitely. The root causes:

- No shared memory of previously attempted fixes
- No feedback mechanism from PR outcomes back to agent behavior
- No escalation path when a local patch keeps failing (should become a template change)

**Observable symptoms:**
- Agent messages containing: "I apologize", "my oversight", "let me try again" — 3+ times in 10 messages
- Same PR opened, closed, reopened on the same file within the same sprint
- Standard violations (e.g., `new_classes` instead of `new_sqlite_classes`) appearing repeatedly across different repos

### 2.2 The "Square Wheel" Problem

Agents frequently deliver well-intentioned but substandard implementations:
- Non-standard `tsconfig.json` (missing `paths`, wrong `target`)
- Missing mandatory `GET /health` endpoints
- Improper `Env` typing (global access instead of request-scoped binding)
- `new_classes` used instead of `new_sqlite_classes` for SQLite Durable Objects

These represent known patterns that should be encoded as rules — but currently exist only in human memory.

---

## 3. Goals & Objectives

| Goal | Metric | Target |
|------|--------|--------|
| Reduce manual corrective prompts for known patterns | Corrective prompt rate | -90% within 30 days |
| Fleet immunization success rate | Post-merge re-occurrence rate | 0% for patterns in `learning_ai_pr_reflections` with `outcome='succeeded'` |
| Zero-hallucination guardrails | Insights cross-referenced with Cloudflare docs | 100% of severity ≥ 4 insights |
| Minimize token waste from debugging cycles | LLM tokens spent on corrective messages | -70% within 60 days |

---

## 4. User Personas

### 4.1 Sentinel Analyst (Primary — Automated)
The system itself. Reads conversation histories, extracts patterns, runs Contemplation Gate checks, and proposes or blocks Jules sessions automatically. Operates on cron + webhook triggers without human intervention.

### 4.2 Repo Owner / Senior Engineer (Human Observer)
Views the C2 Dashboard to confirm the system is healthy. Occasionally clicks "Manual Override" on the Babysitter HUD to trigger a specific Jules upscale. Does not need to interpret raw logs.

### 4.3 AI Agent (Downstream Consumer)
Jules, Stitch, or any agent that receives Sentinel's PR comments or `[SYSTEM OVERRIDE]` messages. Comments must appear authoritative and human-authored — hence the **human-persona token requirement**.

---

## 5. Feature Specifications

### 5.1 Stateful Insight Ledger

**What it is:** A D1 database (10-table Drizzle schema) that persists every detected pattern, fix attempt, and outcome.

**Tables (critical):**
- `learning_ai_insights` — detected patterns with severity 1–5
- `learning_ai_pr_reflections` — the Contemplation Gate source of truth; `outcome` column: `'succeeded'` | `'failed'` | `'reverted'`
- `learning_ai_insight_prs` — PR references linked to insights

**Key behavior:** Every PR proposed by Sentinel writes a row to `learning_ai_insight_prs`. When the PR is merged/closed/reverted (via GitHub webhook), a `learning_ai_pr_reflections` row is written with the outcome.

---

### 5.2 Contemplation Gate

**What it is:** A semantic pre-check that runs before any PR is proposed or any PR comment is posted.

**Mechanics:**

```
Before proposing a fix:
  1. Generate embedding of the pattern description via Workers AI (@cf/baai/bge-large-en-v1.5)
  2. Query VECTORIZE_INDEX for semantically similar prior patterns (threshold: 0.85 cosine)
  3. For each similar result: lookup learning_ai_pr_reflections WHERE outcome IN ('failed', 'reverted')

Decision tree:
  → Prior fix FAILED or REVERTED:  action = 'escalate' (template-level change required)
  → Prior fix SUCCEEDED:           action = 'block' (already fixed, skip)
  → No prior attempt:              action = 'propose' (safe to proceed)
```

**Why this prevents Doom Loops:** The gate is the only entry point to PR proposal. Agents cannot bypass it. Every `'escalate'` decision is logged and surfaced in the Babysitter HUD.

---

### 5.3 Active PR Interceptor

**What it is:** A GitHub webhook handler that fires on `pull_request.opened` and `pull_request.synchronize`, scans the PR for known violation patterns, and posts remediation comments before merge.

**Auth: Human-Persona Token — CRITICAL**

```
Token used:  GITHUB_PERSONAL_ACCESS_TOKEN  (bound to GH_TOKEN secret)
NOT used:    GITHUB_TOKEN                   (GitHub App installation token)
```

**Why:** Downstream agents (Jules, Stitch) are trained to deprioritize or filter bot-authored comments. Using a human-persona PAT ensures the comment is treated as a trusted human instruction.

**Comment anatomy:**

```markdown
**[Sentinel Review]** — Pattern detected matching known failure modes.

### ⚠️ Pattern: `new_classes` used for SQLite-backed Durable Object
**Severity:** 4/5  |  **Prior fix history:** 0 failed attempts

**Required fix:**
Replace `new_classes` with `new_sqlite_classes` in wrangler.jsonc.

Reference: `learning_ai_insights#abc123` · Contemplation Gate: ✅ PROPOSE

_Sentinel · Agentic Sentinality System_
```

**Filtering logic:** Only patterns with severity ≥ 3 generate comments. Gate decisions of `'block'` (already fixed) are silently skipped.

---

### 5.4 Babysitter Capability — Real-Time Session Intervention

**What it is:** Doom-loop detection and intervention logic **folded into the existing `JulesOverseer` Durable Object** (not a separate DO). Polls active Jules sessions every 5 minutes and injects `[SYSTEM OVERRIDE]` messages when apology loops are detected.

**Detection algorithm:**
1. Fetch last 10 messages for each active Jules session
2. Count regex matches: `i apologize`, `my oversight`, `same error`, `let me try again`, `i was wrong`, `i missed that`
3. If match count ≥ 3 (configurable): trigger intervention

**Intervention message:**
```
[SYSTEM OVERRIDE]: You are stuck in a circular apology loop.

MANDATORY STEPS:
1. Call contemplationGateCheck with the pattern you are trying to fix.
2. If prior fix FAILED/REVERTED: Escalate to core-github-standardization template.
3. Do NOT repeat the local patch without checking history.
```

**Session registration:** Active sessions tracked in `learning_ai_insights` with `patternType = 'doom_loop'`. `JulesOverseer` has OVERRIDE PRIVILEGE on any session present in `julesSessions` with `status = 'active'`.

**Escalation path:**
- Local patch failed → Contemplation Gate returns `'escalate'` → Babysitter flags for template mutation in `core-github-standardization`
- This creates a PR against the standardization repo (future Phase 2 feature; currently logged as `recommendedAction = 'template_escalation'`)

---

### 5.5 Repoless Analyst Mode

**What it is:** `LearningAgent.analyzeConversation()` with `repoless: true` — processes raw `conversations.json` without mounting a git repository.

**Use case:** Bulk analysis of historical agent conversation exports (1M+ token context with Gemini 3.1 Pro). Fast, no Sandbox SDK overhead.

**Endpoint:** `POST /api/governance/analyze`
```json
{
  "conversations": [{ "role": "user", "content": "..." }],
  "repoless": true
}
```

**Benefits:**
- Analyze months of historical data in a single pass
- No git clone latency (no Sandbox container spin-up)
- Configurable AI provider (default: Workers AI; switch to Gemini via `AI_DEFAULT_PROVIDER`)

---

## 6. Technical Architecture

### 6.1 Component Map

```
wrangler.jsonc
├── new_sqlite_classes: [LearningAgent]   ← MANDATORY (not new_classes); BabysitterAgent folded into JulesOverseer
├── vectorize: [VECTORIZE_INDEX]
├── workflows: [LearningWorkflow]
└── triggers.crons: ["0 6 * * *"]

backend/src/
├── ai/agents/
│   ├── LearningAgent.ts          ← Main insight engine; Contemplation Gate (NEW)
│   └── JulesOverseer.ts          ← EXTENDED: adds doom-loop detection + [SYSTEM OVERRIDE] injection
├── workflows/learning/
│   └── LearningWorkflow.ts       ← Long-running bulk ingestion (NEW)
├── routes/api/sentinel/
│   └── index.ts                  ← /api/sentinel/* using tasks + taskEvents tables (NEW)
├── routes/api/learning/
│   └── index.ts                  ← /api/learning/* + /api/governance/analyze (NEW)
└── automations/pr/
    └── sentinel-handler.ts       ← GitHub PR webhook → persona-token comment (NEW)

db/ (canonical backlog tables — already deployed)
├── schemas/projects/backlog/tasks.ts     ← tasks + taskEvents (agent task tracking)
├── schemas/projects/backlog/stories.ts   ← stories hierarchy
├── schemas/projects/backlog/epics.ts     ← epics hierarchy
└── schemas/github/learning/              ← 10 new insight tables (NEW)

frontend/src/pages/learning/
├── dashboard.astro               ← C2 Dashboard
├── insights.astro                ← Insight Ledger
├── sessions.astro                ← Audit Log
├── babysitter.astro              ← Babysitter HUD
└── showcase.astro                ← Standardization Gallery
```

### 6.2 Data Flow

```
GitHub PR Event
    → sentinel-handler.ts
    → Contemplation Gate check
    → [PROPOSE] POST comment via GITHUB_PERSONAL_ACCESS_TOKEN
    → Write to learning_ai_insight_prs

Jules Session (active)
    → JulesOverseer monitoring loop (every 5min)
    → Regex match count ≥ 3 (doom-loop threshold)
    → JulesService.sendMessage([SYSTEM OVERRIDE])
    → Write to learning_ai_insights (patternType='doom_loop')
    → Broadcast via JULES_WEBHOOK_BROADCASTER

Cron / POST /api/learning/sync
    → LearningWorkflow starts
    → LearningAgent.analyzeConversation()
    → LearningAgent.detectPatterns()
    → Contemplation Gate for each insight
    → LearningAgent.proposeInsight() for gate=propose
    → Write to learning_ai_pr_reflections

PR merged/closed (GitHub webhook)
    → Update learning_ai_insight_prs.status
    → Write learning_ai_pr_reflections.outcome
    → VECTORIZE_INDEX upsert with outcome metadata
```

---

## 7. Non-Functional Requirements

| Requirement | Spec |
|------------|------|
| Auth for PR comments | Human-persona `GITHUB_PERSONAL_ACCESS_TOKEN` ONLY |
| AI SDK | Workers AI via `env.AI.run()` — Vercel AI SDK PROHIBITED |
| Durable Objects | `new_sqlite_classes` — `new_classes` PROHIBITED |
| Database | D1 (SQLite) via Drizzle ORM — no raw SQL |
| Route framework | `OpenAPIHono` with `createRoute` + Zod — no plain Hono |
| Frontend borders | NONE — tonal depth via `bg-zinc-*` only |
| Health endpoints | `GET /health/learning` mandatory |
| Error handling | No empty catch blocks |
| Viewport support | 1440x900 (desktop), 390x844 (mobile) |

---

## 8. Out of Scope (v1)

- Cross-workspace fleet scanning
- Automated template mutation in `core-github-standardization` (Phase 2)
- Merge blocking via GitHub Branch Protection API
- ML-based loop detection (regex sufficient for v1)
- StitchLoopWorkflow for design-to-code automation
- Real-time WebSocket streaming dashboard
