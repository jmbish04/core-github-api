# AI Learning & Pattern Recognition Engine — Implementation Plan

> **Date:** 2026-03-29
> **Author:** Claude (plan) + Gemini review
> **Scope:** `core-github-api` worker
> **Related repos:** `jmbish04/core-github-standardization`, `jmbish04/core-github-api`
> **Project page:** `https://core-github-api.hacolby.workers.dev/repos/jmbish04/core-github-api/projects`

---

## Context & Problem Statement

Every week a "repetition tax" is paid: AI coding agents (Jules, Gemini Code Assist, Stitch) repeatedly make the same architectural mistakes — empty `catch` blocks, improper global `Env` usage, missing `/health` endpoints, non-standard `tsconfig.json` patterns. When a new model version ships (e.g. Gemini 3.1 after 3.0), new regression patterns emerge immediately and spread across dozens of PRs before guardrails catch up.

**This service closes that loop automatically by:**
1. **Extracting** all AI coding conversations (Jules sessions, GitHub PR threads, Stitch design prompts)
2. **Enriching** each message with Cloudflare Docs context to find what the agent should have known
3. **Identifying** recurring failure patterns (Workers AI + semantic search)
4. **Contemplation Gate** — checking prior PRs before acting to prevent "light switch" loops
5. **Auto-generating PRs** to `core-github-standardization` (templates, `AGENTS.md`, guardrail rules) — continuously fortifying guardrails
6. **Active PR Interception** — monitoring open PRs in real-time and issuing remediation comments before merge

The existing Python script (`scripts/github/ai_conversation_patterns/log_conversations.py`) handles local extraction today (20MB+ conversations.db as of 2026-03-29). This plan ports that logic natively into the worker as a daily cron + webhook-driven Cloudflare Workflow.

---

## Gemini Review — Incorporated Refinements

Gemini (Codex Senior Engineer review) approved the plan with these strategic additions:

| Addition | Description |
|----------|-------------|
| **Active PR Interceptor** | Trigger analysis on PR open/update webhooks; post remediation comments via user-persona token before merge |
| **Merge Queue** | D1-backed queue for post-merge template hardening to avoid conflicts with `core-github-standardization` |
| **Signal-driven Vectorization** | Only vectorize messages with `ai_analysis` content or linked to an `ai_insight` — avoids noise |
| **Contemplation Gate** | Before any PR, query `VECTORIZE_INDEX` for semantic similarity to prior patterns + `ai_pr_reflections` for outcome |
| **Frontend Control Plane** | 4 Astro pages: dashboard (trendlines), sessions (audit log), board (Kanban), showcase (Upscale button) |
| **Health monitoring** | `/health/learning` endpoint in `backend/src/health/` |
| **`aiInsights.status`** | Add `status` enum: `PENDING → IN_VERIFICATION → IMMUNIZED / REVERTED / OBSERVED` |
| **`aiInsightPrs.outcome`** | Track PR lifecycle: `OPEN → MERGED / CLOSED / REVERTED` |

---

## Existing Infrastructure to Leverage (Do NOT Reinvent)

| Component | Location | How Used |
|-----------|----------|----------|
| **Tags table** | `backend/src/db/schemas/app/tags.ts` | Reuse — `learning_tag_mapping.tagId` → `tags.id` |
| **Jules SDK** | `backend/src/services/julius/jules.ts` | `JulesService` for session/activity ingestion |
| **GitHub Octokit** | `backend/src/services/octokit/core.ts` | `getOctokit()` for PR comment ingestion |
| **createPullRequest** | `backend/src/ai/mcp/tools/github/prs.ts` | Submit improvement PRs |
| **AI providers** | `backend/src/ai/providers/index.ts` | Workers AI (analysis) + Claude (synthesis) |
| **Cloudflare Docs MCP** | Existing MCP config | Enrich messages with CF Docs ground truth |
| **Workflow pattern** | `backend/src/workflows/health.ts` | Follow same step structure |
| **DB schema barrel** | `backend/src/db/schemas/github/index.ts` | Add `export * from './learning'` |
| **Cron triggers** | `wrangler.jsonc` | Add daily 6am UTC |
| **Sandbox SDK** | Already bound | Git clone repos to verify prior PR fixes |
| **VECTORIZE_INDEX** | `wrangler.jsonc` binding | Semantic search during Contemplation Gate |
| **Webhook handlers** | `backend/src/automations/pr/` | Add PR open/update handler for Active PR Interceptor |
| **pm_projects/epics/stories/tasks** | `backend/src/db/schemas/projects/hierarchy.ts` | Seed from `project_tasks.json` |

---

## Database Schema: Learning Micro-Domain

**Location:** `backend/src/db/schemas/github/learning/`

```
learning_sessions          ← 1 row per daily run
  └─ learning_threads      ← 1 per conversation (Jules session / PR / Stitch screen)
       └─ learning_messages ← 1 per message / activity
            ├─ learning_enrichment        ← CF Docs query+response (1:many per message)
            ├─ learning_tag_mapping       ← Tag assignments (→ app.tags)
            └─ learning_ai_insight_messages ← Links to discovered insights

learning_ai_insights       ← Distinct actionable patterns
  ├─ status: PENDING | IN_VERIFICATION | IMMUNIZED | REVERTED | OBSERVED
  ├─ learning_ai_insight_messages
  ├─ learning_ai_insight_pr_mapping
  └─ learning_ai_pr_reflections

learning_ai_insight_prs    ← PRs submitted to fix issues
  ├─ outcome: OPEN | MERGED | CLOSED | REVERTED
  ├─ learning_ai_insight_pr_mapping
  └─ learning_ai_pr_reflections
```

### Key Schema Details

All schemas include `createSelectSchema` + `createInsertSchema` from `drizzle-orm/zod` with `.openapi()` extension for `@hono/zod-openapi` compatibility.

**Critical indexes:**
- `learning_threads.sourceIdentifier` — unique index for deduplication
- `learning_ai_insights.category` — for pattern grouping queries
- `learning_ai_pr_reflections.sessionId` — for Contemplation Gate lookups

**Reuse pattern for tags:**
```typescript
// tagMapping.ts references existing app/tags table
import { tags } from '../../app/tags';
tagId: text('tag_id').references(() => tags.id)
```

**Status fields (Gemini addition):**
```typescript
// aiInsights.ts
status: text('status', {
  enum: ['PENDING', 'IN_VERIFICATION', 'IMMUNIZED', 'REVERTED', 'OBSERVED']
}).default('PENDING')

// aiInsightPrs.ts
outcome: text('outcome', {
  enum: ['OPEN', 'MERGED', 'CLOSED', 'REVERTED']
}).default('OPEN')
```

---

## Phase 1: Database Schemas

**Files to create:** `backend/src/db/schemas/github/learning/`
- `sessions.ts`, `threads.ts`, `messages.ts`, `enrichment.ts`, `tagMapping.ts`
- `aiInsights.ts`, `aiInsightMessages.ts`, `aiInsightPrs.ts`, `aiInsightPrMapping.ts`, `aiPrReflections.ts`
- `index.ts` — barrel export all 10

**Modify:** `backend/src/db/schemas/github/index.ts` — add `export * from './learning'`

**Migrate:** `npm run migrate:db`

---

## Phase 2: Learning Ingestion Service

**Location:** `backend/src/services/learning/`

`LearningIngestionService.ingest(env, sessionId)`:
1. **Jules** — `JulesService.listSessions()` → threads/messages. Dedup by `sourceIdentifier` unique index.
2. **GitHub PRs** — `getOctokit(env)` search merged PRs by `jmbish04` → PR body + comments. Dedup by PR URL.
3. **Stitch** — Stitch MCP paginated API. Dedup by `stitch/{projectId}/{screenName}`.

---

## Phase 3: LearningAgent (Durable Object)

**Location:** `backend/src/ai/agents/LearningAgent.ts`

### Tools

| Tool | Purpose |
|------|---------|
| `enrichMessage` | CF Docs MCP query → log to `learning_enrichment` |
| `tagMessage` | Apply tags from `app.tags` table; create new tag if genuinely new category |
| `analyzeMessage` | Workers AI synthesis → update `messages.aiAnalysis` |
| `createInsight` | 3+ threads same category → insert `learning_ai_insights` (status: PENDING) |
| `contemplateFix` | **Contemplation Gate:** VECTORIZE_INDEX semantic search + `ai_pr_reflections` D1 lookup → determine `UPGRADE_TEMPLATE` vs `SUGGEST_PATCH` |
| `submitImprovementPr` | `createPullRequest` → log to `learning_ai_insight_prs` + mapping; update insight status: IN_VERIFICATION |
| `issueRemediationComment` | Post GitHub PR comment using user-persona token → direct assigned coding agent |

### Execution Flow (per session)

```
1. Ingest → learning_threads + learning_messages
2. Per message: enrichMessage → tagMessage → analyzeMessage
3. Per thread: summarize conversation
4. Pattern detection: 3+ threads same category → createInsight
5. Per insight: contemplateFix (Vectorize + D1 lookback 90 days)
6. If actionable → submitImprovementPr → update insight.status = IN_VERIFICATION
7. Update learning_sessions.actionTaken + actionRationale
```

### Contemplation Gate (anti-light-switch)

```typescript
async contemplateFix({ category, currentPattern }) {
  // 1. Vectorize semantic search — did we encounter this before?
  const semanticMatches = await env.VECTORIZE_INDEX.query(
    await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: currentPattern }),
    { topK: 3 }
  );

  // 2. D1 check — did prior PRs for this category fail?
  const priorOutcomes = await db.select()
    .from(learningAiPrReflections)
    .where(eq(learningAiPrReflections.agentAnalysis, category))
    .limit(5);

  const needsTemplateChange = priorOutcomes.some(r => r.prSuccessDetermination === 'FAILED');

  return {
    repeatOffender: semanticMatches.matches.length > 0,
    action: needsTemplateChange ? 'UPGRADE_TEMPLATE' : 'SUGGEST_PATCH',
    target: needsTemplateChange ? 'core-github-standardization' : 'core-github-api'
  };
}
```

### Signal-Driven Vectorization

Only vectorize messages that have `ai_analysis` populated OR are linked to an `ai_insight`. Prevents noise in the semantic search index.

---

## Phase 4: Active PR Interceptor (Gemini Addition)

**Location:** `backend/src/automations/pr/learning-interceptor.ts`

Triggered by PR `opened` / `synchronize` webhook events (wire into existing webhook handler in `backend/src/automations/pr/`).

Flow:
1. Receive PR webhook → check if PR author is a known AI agent (Jules, Gemini Code Assist)
2. Run lightweight pattern scan against `learning_ai_insights` for matching category
3. If violation detected → post comment via user-persona GH token: `"🔍 Pattern analysis detected: [category]. @{agent} please address: [prompt]"`
4. Queue post-merge hardening: if PR closes a flagged insight → trigger template update workflow after merge webhook

**Merge Queue** (D1-backed):
- Table: extend `learning_ai_insight_prs` with `mergeQueueStatus` field
- After PR merge webhook: trigger Jules session to apply fix to `core-github-standardization`

---

## Phase 5: Cloudflare Workflow + Cron

**Location:** `backend/src/workflows/learning.ts`

```typescript
// wrangler.jsonc additions:
workflows: [{ name: 'learning-workflow', class_name: 'LearningWorkflow', binding: 'LEARNING_WORKFLOW' }]
triggers.crons: '0 6 * * *'  // Daily 6am UTC
```

Steps: `createSession` → `ingestConversations` → `runAnalysis` (DO) → `finalizeSession`

---

## Phase 6: API Routes

**Location:** `backend/src/routes/learning.ts` (or `backend/src/routes/api/learning/index.ts`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/learning/sync` | Manual trigger |
| `GET` | `/api/learning/sessions` | List sessions |
| `GET` | `/api/learning/insights` | Filter by category/status/q |
| `GET` | `/api/learning/insights/:id` | Single insight + linked data |
| `GET` | `/api/learning/insights/global` | Aggregated Standardization Score per category |
| `POST` | `/api/learning/upscale` | Start Jules session with standardization context |

---

## Phase 7: Frontend Control Plane (Astro + Dark Shadcn)

**Location:** `frontend/src/pages/learning/`

### Pages

| Page | Path | Description |
|------|------|-------------|
| **Dashboard** | `/learning/dashboard` | Recharts trendlines — "Manual Corrections per PR" vs "Immunized Rules." Queries `learning_sessions` + `learning_ai_insights` |
| **Sessions** | `/learning/sessions` | Shadcn Table of analysis runs. Expandable rows → threads → enrichment → docs grounding |
| **Board** | `/learning/board` | kibo-ui Kanban: `DETECTED → IN_VERIFICATION → IMMUNIZED`. Maps to `learning_ai_insights.status` |
| **Showcase** | `/learning/showcase` | Grid of Shadcn Cards for every standard in `core-github-standardization`. Each card: view file, **"Upscale Current Repo"** button |

### Upscale Button Flow
1. Click → `POST /api/learning/upscale` with `{ repoName: 'jmbish04/core-github-api' }`
2. API fetches latest standardization file contents from `core-github-standardization`
3. Starts Jules session with context: "Audit this repo against these standards"
4. Returns Jules session ID → frontend polls for result

---

## Phase 8: Health Monitoring

**Location:** `backend/src/health/learning.ts`

Integrated into existing health suite pattern. Monitors:
- AI Gateway latency for CF Docs enrichment calls
- Sandbox SDK container availability
- `learning_sessions` last successful run timestamp
- `learning_ai_insight_prs` open PR count

Route: `GET /health/learning`

---

## Files to Create

```
backend/src/db/schemas/github/learning/
├── sessions.ts
├── threads.ts
├── messages.ts
├── enrichment.ts
├── tagMapping.ts
├── aiInsights.ts
├── aiInsightMessages.ts
├── aiInsightPrs.ts
├── aiInsightPrMapping.ts
├── aiPrReflections.ts
└── index.ts

backend/src/services/learning/
├── index.ts
├── types.ts
└── ingestion.ts

backend/src/ai/agents/LearningAgent.ts
backend/src/workflows/learning.ts
backend/src/routes/learning.ts (or routes/api/learning/index.ts)
backend/src/automations/pr/learning-interceptor.ts
backend/src/health/learning.ts

frontend/src/pages/learning/
├── dashboard.astro
├── sessions.astro
├── board.astro
└── showcase.astro
```

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/db/schemas/github/index.ts` | Add `export * from './learning'` |
| `wrangler.jsonc` | Workflow binding + `"0 6 * * *"` cron |
| Webhook handler (PR) | Wire `learning-interceptor.ts` on `opened` / `synchronize` |
| Main app router | Mount `/api/learning` routes |
| `backend/src/health/index.ts` | Register learning health check |

---

## Agent Rules to Create

### `.agent/rules/learning-engine.md`
- **GROUND TRUTH MANDATE:** Never mark a pattern as "incorrect" without a 200 OK from `cloudflare-docs` MCP
- **ANTI-LOOP PROTECTION:** Always query `ai_pr_reflections` before proposing a PR
- **PERSONA AUTH:** All remediation comments use `GH_TOKEN` (user persona) — not app token
- **IDEMPOTENCY:** Check `sourceIdentifier` uniqueness before every thread/message insert
- **RELATIONAL GROUNDING:** Every `ai_insight` must have `ai_insight_messages` mapping rows for audit traceability

---

## Migration & Verification

```bash
npm run migrate:db
# Verify 10 new learning_* tables in D1

# Test manual sync
curl -X POST https://core-github-api.hacolby.workers.dev/api/learning/sync

# Check seeded data (see project_tasks.json for pm_projects seed)
```

### Verification Checklist
- [ ] 10 `learning_*` tables created in D1
- [ ] `POST /api/learning/sync` returns workflow run ID
- [ ] `learning_sessions` has 1 new row after trigger
- [ ] `learning_threads` + `learning_messages` populated from Jules API
- [ ] `learning_enrichment` has CF Docs responses
- [ ] `learning_ai_insights` has detected patterns
- [ ] If PR generated → `learning_ai_insight_prs` + GitHub PR visible
- [ ] Frontend `/learning/board` shows insights in Kanban columns
- [ ] Contemplation Gate prevents duplicate PRs for already-immunized categories
- [ ] Active PR Interceptor posts comment on Jules PR with detected violations
