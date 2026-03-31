# Agentic Sentinality — Implementation Plan v2.3

> **Role:** Senior Meta-Governance Architect
> **Project ID:** `proj-sentinel-001`
> **Revision:** v2.3 — BabysitterAgent folded into JulesOverseer; task tracking on canonical backlog tables; new_sqlite_classes: [LearningAgent] only
> **Stack:** Hono OpenAPI v3.1.0 · Drizzle ORM (D1) · Workers AI · `@cloudflare/agents` · Astro + React + Shadcn Dark
> **Date:** 2026-03-31
> **Status:** Ready for Agent Execution

---

## Executive Context

The `core-github-api` worker currently manages Jules AI coding sessions reactively: it monitors for stuck sessions (`JulesOverseer`), enforces standards, and tracks PRs. However, agents repeatedly make the same mistakes — **Doom Loops** and **Apology Cycles** — because there is no shared memory of what was tried, what failed, and what patterns are systemic vs. incidental.

**Agentic Sentinality** transforms this into a proactive, self-healing immune system:

```
[GitHub PR Events]     → [Active PR Interceptor]     → comments via human-persona token
                                                       → Contemplation Gate check before comment

[Jules Sessions]       → [JulesOverseer — Babysitter]  → monitors for apology/doom loops
                                                       → injects [SYSTEM OVERRIDE] messages

[Conversational Data]  → [LearningAgent DO]           → enriches & stores insights in D1
                                                       → embeds patterns into Vectorize
                                                       → runs in repoless mode for bulk ingestion

[Cron / Manual Sync]   → [LearningWorkflow]           → bulk ingestion & reflection generation
                                                       → feeds Contemplation Gate
```

---

## Global Traceability & Requirements Audit

### ✅ Accepted (This Iteration)
- Doom Loop / Apology Cycle detection and prevention via `learning_ai_pr_reflections`
- Contemplation Gate: dual-check (Vectorize semantic similarity + D1 outcome history)
- Babysitter capability (doom-loop detection + `[SYSTEM OVERRIDE]` injection) folded into `JulesOverseer` — zero new DOs
- Active PR Interceptor using `GITHUB_PERSONAL_ACCESS_TOKEN` (human-persona, not bot)
- `LearningAgent` Durable Object for insight enrichment and analysis
- D1 Stateful Insight Ledger (10 schema tables in `backend/src/db/schemas/github/learning/`)
- `repoless: true` flag on `LearningAgent.analyzeConversation()` for bulk text-only analysis
- Cloudflare Workflows for long-running ingestion (`LearningWorkflow`)
- `new_sqlite_classes` enforcement — replaces deprecated `new_classes`
- `db:auto` script in `package.json` for zero-touch migrations
- Frontend 5-view Sentinel dashboard ("The Monolith" — Brutalist Sanctuary aesthetic)
- Cloudflare Vectorize for semantic pattern similarity search
- `.agent/rules/durable_objects.md` guardrail rule file

### ❌ Rejected / Deferred
- Cross-workspace fleet scanning (requires multi-tenant auth; deferred to Phase 2)
- Automated template mutation in `core-github-standardization` (requires Sandbox SDK orchestration; deferred)
- `StitchLoopWorkflow` for design-to-code automation (separate initiative)
- Real-time streaming WebSocket dashboard (Astro SSR sufficient for v1)
- `learning_ai_insight_pr_mapping` complex relation table (absorbed into `learning_ai_insight_prs`)
- Blocking PRs via GitHub Branch Protection API (requires GitHub App permission upgrade; deferred)
- ML-based apology loop detection (regex sufficient for v1; ML deferred)

---

## Phase 1 — Database Schemas

**Directory:** `backend/src/db/schemas/github/learning/`

Follow the established Drizzle SQLite pattern from `backend/src/db/schemas/app/tags.ts` and `backend/src/db/schemas/jules/sessions.ts`. Each table uses `text('id').primaryKey()`, `integer('created_at', { mode: 'timestamp' }).default(sql\`(unixepoch())\`)`.

### 1.1 File Manifest

| File | Table | Purpose |
|------|-------|---------|
| `sessions.ts` | `learning_sessions` | Analysis run tracking; trigger type, status, insight count |
| `threads.ts` | `learning_threads` | Conversation threads grouped by topic/agent run |
| `messages.ts` | `learning_messages` | Individual messages; raw content + Vectorize embedding ID |
| `enrichment.ts` | `learning_enrichment` | Cloudflare docs grounding results; matched URLs + relevance scores |
| `learningTags.ts` | `learning_tags` | Taxonomy (identical pattern to `backend/src/db/schemas/app/tags.ts`) |
| `learningTagMapping.ts` | `learning_tag_mapping` | Many-to-many: insights ↔ tags |
| `aiInsights.ts` | `learning_ai_insights` | Core detected pattern; type, severity, status |
| `aiInsightMessages.ts` | `learning_ai_insight_messages` | Many-to-many: messages that contributed to an insight |
| `aiInsightPrs.ts` | `learning_ai_insight_prs` | PRs created in response to an insight; includes outcome |
| `aiPrReflections.ts` | `learning_ai_pr_reflections` | ⚠️ **Contemplation Gate source of truth** |

### 1.2 Critical Schema — `aiPrReflections.ts`

```typescript
import { text, integer, sqliteTable, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningAiPrReflections = sqliteTable(
  'learning_ai_pr_reflections',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    insightId: text('insight_id').notNull(),
    priorInsightId: text('prior_insight_id'),   // ID of the insight this echoes
    priorPrId: text('prior_pr_id'),             // ID of the PR that was previously attempted
    outcome: text('outcome').notNull(),          // 'succeeded' | 'failed' | 'reverted'
    rootCause: text('root_cause'),              // AI-generated diagnosis
    recommendedAction: text('recommended_action'), // 'local_patch' | 'template_escalation' | 'block'
    vectorSimilarityScore: text('vector_similarity_score'), // stored as text to preserve precision
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    insightIdx: index('reflection_insight_idx').on(table.insightId),
    outcomeIdx: index('reflection_outcome_idx').on(table.outcome),
  })
);
```

### 1.3 Schema for `learning_ai_insights`

```typescript
export const learningAiInsights = sqliteTable(
  'learning_ai_insights',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    patternType: text('pattern_type').notNull(), // 'doom_loop' | 'anti_pattern' | 'standard_violation' | 'best_practice'
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: integer('severity').notNull().default(1), // 1–5; 5 = critical
    vectorId: text('vector_id'),      // Vectorize index reference
    status: text('status').notNull().default('open'), // 'open' | 'acknowledged' | 'resolved'
    repo: text('repo'),               // affected repo if known
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  }
);
```

### 1.4 Schema for `learning_sessions`

```typescript
export const learningSessions = sqliteTable('learning_sessions', {
  id: text('id').primaryKey(),
  triggerType: text('trigger_type').notNull(), // 'cron' | 'manual' | 'webhook'
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
  insightCount: integer('insight_count').default(0),
  source: text('source'),           // conversations.json reference or session batch ID
  repoless: integer('repoless', { mode: 'boolean' }).default(false),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
```

### 1.5 Index File & Schema Registration

- Create `backend/src/db/schemas/github/learning/index.ts` — re-exports all 10 tables
- Update `backend/src/db/schemas/github/index.ts` — add `export * from './learning'`
- Update `backend/src/db/schema.ts` — import learning schemas and include in global export

### Phase 1 Traceability
**Accepted:** All 10 tables. `outcome` column on reflections as Contemplation Gate. `repoless` flag on sessions. `vectorId` on insights. Severity 1–5 scale.
**Deferred:** Vectorize schema management (Cloudflare manages index structure; referenced via string IDs). Full-text search on `description` (D1 FTS deferred; use Vectorize for semantic search in v1).

---

## Phase 2 — LearningAgent Durable Object

**File:** `backend/src/ai/agents/LearningAgent.ts`

### 2.1 Pattern

Extends `BaseAgent` from `backend/src/ai/agents/base/BaseAgent.ts`. Follow the exact structure of `JulesOverseer.ts` — constructor signature `(state: DurableObjectState, env: Env)`, `fetch()` routing, and tool registration pattern.

### 2.2 Tools

```typescript
export class LearningAgent extends BaseAgent {

  // Accepts raw conversations.json payload or pulls from D1 session
  // When repoless=true: skips all git/Sandbox operations
  async analyzeConversation(payload: ConversationPayload, repoless = false): Promise<string>

  // Runs Workers AI structured analysis, writes to learning_ai_insights
  async detectPatterns(sessionId: string): Promise<InsightSummary[]>

  // ⚠️ THE CONTEMPLATION GATE — call before ANY PR proposal
  // 1. Semantic search in VECTORIZE_INDEX (threshold: 0.85)
  // 2. D1 query: SELECT * FROM learning_ai_pr_reflections WHERE insightId = ? AND outcome IN ('failed','reverted')
  // Returns: { action: 'propose' | 'block' | 'escalate', reason: string, priorReflectionId?: string }
  async contemplationGateCheck(patternDescription: string): Promise<GateDecision>

  // Only called after contemplationGateCheck returns action = 'propose'
  // Calls JulesService.startSession() with standardization context
  async proposeInsight(insightId: string): Promise<void>
}
```

### 2.3 Contemplation Gate Logic

```
contemplationGateCheck(description):
  embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: description })
  similar = await env.VECTORIZE_INDEX.query(embedding.data[0], { topK: 5, returnMetadata: true })

  for each result where score > 0.85:
    reflection = await db.select().from(learningAiPrReflections)
                   .where(eq(learningAiPrReflections.insightId, result.metadata.insightId))
                   .orderBy(desc(learningAiPrReflections.createdAt)).limit(1)

    if reflection.outcome === 'failed' or 'reverted':
      return { action: 'escalate', reason: 'Prior fix failed. Requires template-level immunization.', priorReflectionId: reflection.id }

    if reflection.outcome === 'succeeded':
      return { action: 'block', reason: 'Already fixed and merged.' }

  return { action: 'propose', reason: 'No prior attempt found. Safe to proceed.' }
```

### 2.4 Env Bindings Required

```typescript
// Add to Env interface in backend/src/types/env.d.ts or similar:
VECTORIZE_INDEX: VectorizeIndex;     // NEW — add to wrangler.jsonc
LEARNING_WORKFLOW: Workflow;         // NEW — add to wrangler.jsonc
JULES_API_KEY: string;               // NEW secret
// Existing bindings used: DB, AI, GITHUB_PERSONAL_ACCESS_TOKEN
```

### Phase 2 Traceability
**Accepted:** `repoless: true` flag. Dual-check gate (Vectorize + D1). `'escalate'` action for repeat failures. `0.85` similarity threshold. Uses existing `env.AI` Workers AI binding — NOT Vercel AI SDK.
**Deferred:** Gemini 3.1 Pro for Repoless Analyst (existing multi-provider `AI_DEFAULT_PROVIDER` config makes this switchable post-v1). Threshold auto-tuning (deferred).

---

## Phase 3 — Babysitter Capability (Extends `JulesOverseer`)

> **Antigravity Revision:** The Babysitter is NOT a separate Durable Object. Doom-loop detection is folded into the existing `JulesOverseer` DO to avoid unnecessary resource creation. `JulesOverseer` already has the monitoring loop, session polling, and `JulesService` access.

**File to modify:** `backend/src/ai/agents/JulesOverseer.ts`

### 3.1 Add Doom-Loop Detection to Monitoring Loop

Within the existing session check loop, append:

```typescript
private static readonly APOLOGY_PATTERNS = [
  /i apologize/i,
  /my oversight/i,
  /same error/i,
  /i made a mistake/i,
  /let me try again/i,
  /i was wrong/i,
  /i missed that/i,
];

private static readonly LOOP_THRESHOLD = 3; // 3+ in last 10 msgs = intervention

private async detectAndIntervene(sessionId: string, messages: Message[]): Promise<void> {
  const recent = messages.slice(-10);
  const matchCount = recent.filter(m =>
    JulesOverseer.APOLOGY_PATTERNS.some(p => p.test(m.content))
  ).length;

  if (matchCount >= JulesOverseer.LOOP_THRESHOLD) {
    await julesService.sendMessage(sessionId, OVERRIDE_TEMPLATE);
    await this.db.insert(learningAiInsights).values({
      id: createId(),
      sessionId,
      patternType: 'doom_loop',
      title: `Apology loop detected in session ${sessionId}`,
      description: `${matchCount} apology pattern matches in last 10 messages`,
      severity: 4,
      status: 'open',
    });
    // Broadcast via JulesWebhookBroadcaster
    await this.env.JULES_WEBHOOK_BROADCASTER
      .get(this.env.JULES_WEBHOOK_BROADCASTER.idFromName('jules-broadcaster'))
      .fetch('/internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'system_override', sessionId, reason: 'doom_loop_detected' }),
      });
  }
}
```

### 3.2 Override Message Template

```
[SYSTEM OVERRIDE]: You are stuck in a circular apology loop.

MANDATORY STEPS BEFORE YOUR NEXT PROPOSAL:
1. Call `contemplationGateCheck` with the pattern you are trying to fix.
2. Query `learning_ai_pr_reflections` for prior attempts on this insight.
3. If a prior fix was FAILED or REVERTED: Do NOT repeat the local patch. Instead, flag this for template-level immunization in `core-github-standardization`.
4. If this is a NEW pattern: Proceed with the local patch.

Continuing the same approach without checking history is prohibited.
```

### 3.3 `wrangler.jsonc` Addition — CRITICAL

Only `LearningAgent` needs `new_sqlite_classes` (it extends `BaseAgent` from `@cloudflare/agents`). `JulesOverseer` is already registered — no migration needed for the babysitter capability.

```jsonc
"migrations": [
  {
    "tag": "v1_sentinel",
    "new_sqlite_classes": ["LearningAgent"]
  }
]
```

**⚠️ NEVER use `new_classes` for SQLite-backed Durable Objects.** The `new_classes` array does not initialize the SQLite storage layer required by the `Agent` base class from `@cloudflare/agents`.

### Phase 3 Traceability
**Accepted:** Babysitter capability folded into `JulesOverseer` (zero new DOs). Regex-based detection. `[SYSTEM OVERRIDE]` injection via `JulesService` (existing). `LOOP_THRESHOLD = 3`. Logs as `doom_loop` insight. Broadcasts via `JULES_WEBHOOK_BROADCASTER` (existing binding).
**Revised from v1:** No standalone `BabysitterAgent.ts` — Antigravity audit confirmed `JulesOverseer` already contains all required infrastructure.
**Deferred:** Slack notification on intervention (deferred; existing `alerts` table used for now). Configurable threshold per-repo (deferred).

---

## Phase 4 — Cloudflare Workflows

**File:** `backend/src/workflows/learning/LearningWorkflow.ts`

```typescript
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface WorkflowParams {
  triggerType: 'cron' | 'manual';
  batchSize?: number;
}

export class LearningWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const sessionId = await step.do('create-session', async () => {
      // Insert into learning_sessions, return id
    });

    const messages = await step.do('fetch-unprocessed-messages', async () => {
      // Query learning_messages WHERE processed = false, LIMIT batchSize
    });

    const insights = await step.do('detect-patterns', async () => {
      // Invoke LearningAgent.detectPatterns(sessionId)
    });

    await step.do('run-contemplation-gate', async () => {
      // For each insight, call LearningAgent.contemplationGateCheck()
      // Log decisions to learning_ai_pr_reflections
    });

    await step.do('propose-prs', async () => {
      // For each insight with gate decision 'propose', call LearningAgent.proposeInsight()
    });

    await step.do('finalize-session', async () => {
      // Update learning_sessions.status = 'completed', insightCount = insights.length
    });
  }
}
```

**`wrangler.jsonc` Additions:**
```jsonc
"workflows": [
  {
    "name": "LearningWorkflow",
    "binding": "LEARNING_WORKFLOW",
    "class_name": "LearningWorkflow",
    "script_name": "core-github-api"
  }
],
"triggers": {
  "crons": ["0 6 * * *"]
}
```

---

## Phase 5 — Sentinel Ingestor Service

**File:** `backend/src/services/sentinel/ingestor.ts`

Lightweight Hono sub-app mounted at `/api/sentinel/*`. Acts as the "eyes and ears" that feeds raw data into the Insight Ledger.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sentinel/ingest` | POST | Accept `conversations.json` payload; queue for LearningWorkflow |
| `/api/sentinel/status` | GET | Ingestor health + queue depth + last run timestamp |
| `/api/sentinel/patterns` | GET | Top 10 recently detected high-signal patterns (severity ≥ 4) |

High-signal patterns (severity ≥ 4) are immediately flagged and queued for Contemplation Gate check without waiting for the nightly cron.

---

## Phase 6 — API Routes

**File:** `backend/src/routes/api/learning/index.ts`

All routes use `OpenAPIHono` with `createRoute` + Zod schemas derived via `drizzle-zod` (`createSelectSchema`, `createInsertSchema`). Follow the exact pattern from `backend/src/routes/api/agents/`.

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const learningRouter = new OpenAPIHono<{ Bindings: Env }>();
```

### Route Inventory

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| POST | `/api/learning/sync` | Trigger `LearningWorkflow` | Returns `{ sessionId, status: 'started' }` |
| GET | `/api/learning/sessions` | List `learning_sessions` | Paginated; filter by status, triggerType |
| GET | `/api/learning/insights` | List `learning_ai_insights` | Filter: patternType, severity, status, repo |
| GET | `/api/learning/insights/global` | Aggregated pattern counts | Groups by patternType |
| GET | `/api/learning/insights/:id` | Single insight + linked messages | Joins `learning_ai_insight_messages` |
| POST | `/api/learning/upscale` | Start Jules session w/ standardization context | Uses `JulesService.startSession()` |
| POST | `/api/governance/analyze` | **Repoless Analyst** | Body: `{ conversations: [], repoless: true }` |
| GET | `/health/learning` | Health check | Returns `{ status: 'healthy', lastRun, insightCount }` |

### `/api/governance/analyze` — Repoless Analyst Detail

```typescript
const repolessRoute = createRoute({
  method: 'post',
  path: '/analyze',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            conversations: z.array(z.object({
              role: z.enum(['user', 'assistant', 'system']),
              content: z.string(),
              timestamp: z.string().optional(),
            })),
            repoless: z.literal(true),
            model: z.string().optional().default('gemini-3-pro-preview'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: InsightsResponseSchema } },
      description: 'Detected insights with severity scores',
    },
  },
});
```

### Mount in `backend/src/index.ts`
```typescript
app.route('/api/learning', learningRouter);
app.route('/api/sentinel', sentinelRouter);
app.route('/api/governance', governanceRouter);
```

---

## Phase 7 — Active PR Interceptor

**File:** `backend/src/automations/pr/sentinel-handler.ts`

### 7.1 Trigger

GitHub webhook events: `pull_request.opened`, `pull_request.synchronize`

Register handler in `backend/src/routes/api/webhooks/` — follow existing webhook handler pattern.

### 7.2 Critical: Human-Persona Token Auth

```typescript
import { Octokit } from '@octokit/rest';

// ✅ CORRECT: GITHUB_PERSONAL_ACCESS_TOKEN = GH_TOKEN secret (human-persona)
const octokit = new Octokit({ auth: env.GITHUB_PERSONAL_ACCESS_TOKEN });

// ❌ WRONG: env.GITHUB_TOKEN (GitHub App installation token — filtered as bot noise)
```

The `GITHUB_PERSONAL_ACCESS_TOKEN` binding is already configured in `wrangler.jsonc` (bound to the `GH_TOKEN` entry in the secrets store). No new secrets needed.

### 7.3 Handler Flow

```
sentinelPrHandler(event, env):
  repo = event.repository.full_name
  prNumber = event.pull_request.number
  prBranch = event.pull_request.head.ref

  // 1. Query for relevant patterns in this repo
  insights = await db.select().from(learningAiInsights)
    .where(and(
      or(eq(learningAiInsights.repo, repo), isNull(learningAiInsights.repo)),
      gte(learningAiInsights.severity, 3),
      eq(learningAiInsights.status, 'open'),
    ))
    .limit(5)

  if insights.length === 0: return  // nothing to report

  // 2. Run Contemplation Gate for each
  for each insight:
    gate = await LearningAgent.contemplationGateCheck(insight.description)
    if gate.action === 'block': skip (already fixed)

  // 3. Post remediation comment using persona token
  commentBody = buildRemedationComment(insights, gateResults)
  await octokit.issues.createComment({ owner, repo: repoName, issue_number: prNumber, body: commentBody })

  // 4. Log PR reference
  await db.insert(learningAiInsightPrs).values({ insightId, prNumber, repo, status: 'open' })
```

### 7.4 Comment Format

```markdown
**[Sentinel Review]** — Patterns detected in this PR matching known failure modes.

---

### ⚠️ Pattern: `new_classes` used for SQLite-backed Durable Object
**Severity:** 4/5
**Required fix:** Replace `new_classes` with `new_sqlite_classes` in `wrangler.jsonc` migrations array.

**Prior fix history:** 0 failed attempts. Local patch recommended.

> Reference: `learning_ai_insights#abc123` · [Contemplation Gate: ✅ PROPOSE]

---

_This comment was generated by Sentinel. Please resolve before merge._
```

### Phase 7 Traceability
**Accepted:** `GITHUB_PERSONAL_ACCESS_TOKEN` (human-persona) for PR comments. Comment includes prior fix history. Severity threshold ≥ 3 for reporting. Logs to `learning_ai_insight_prs`.
**Deferred:** Blocking merge via GitHub Branch Protection API (requires GitHub App permission upgrade). Auto-labeling PRs with `sentinel-review` tag (deferred).

---

## Phase 8 — Frontend Dashboard

**Directory:** `frontend/src/pages/learning/`

### 8.1 Design Rules — The Monolith / Brutalist Sanctuary

| Rule | Implementation |
|------|---------------|
| No borders | NEVER use `border`, `border-zinc-*`, `divide-*` classes |
| Hierarchy via depth | `bg-zinc-950` → `bg-zinc-900` → `bg-zinc-800` |
| Text contrast | `text-zinc-50` primary, `text-zinc-400` secondary |
| OKLCH colorspace | All custom colors via `oklch()` in CSS vars |
| Recharts labels | `fill="#fafafa"` on all axes, tooltips, legends |
| Typography | `tracking-tighter` on H1/H2, monospace accent on metrics |
| Sidebar | `AppSidebar` from `frontend/src/components/layout/AppSidebar.tsx` — required on all pages |
| Error states | `UnifiedErrorDisplay` from `frontend/src/components/ErrorDisplay/` |
| Viewports | 1440x900 desktop, 390x844 mobile |
| FORBIDDEN | Vercel AI SDK; use Workers AI via `env.AI` through the API |

### 8.2 Pages

#### `dashboard.astro` — C2 Dashboard (`/learning/dashboard`)
- Recharts `<AreaChart>` of insights detected per day (last 30 days)
- Live Jules session status cards (`bg-zinc-900`, severity badge)
- Pattern type distribution `<BarChart>` (doom_loop / anti_pattern / violation / best_practice)
- Top-right "Immunity Indicator" pulse dot (green = healthy, amber = interventions active)
- All chart labels: `fill="#fafafa"`

#### `insights.astro` — Insight Ledger (`/learning/insights`)
- Grid of Shadcn `<Card>` components, `bg-zinc-900`
- Filter bar: patternType enum, severity slider 1–5, status toggle
- Each card: title, severity badge, prior-fix count, CTA "View in Jules"
- Pagination: 20 per page

#### `sessions.astro` — Audit Log (`/learning/sessions`)
- Shadcn `<Table>` with collapsible rows
- Columns: Session ID, Trigger, Insights Found, Duration, Status badge
- Collapse to show: message sample list, model used, repoless flag

#### `babysitter.astro` — Babysitter HUD (`/learning/babysitter`)
- Live table of active Jules sessions
- Per-session: loop detection score (0–10), last message preview, intervention count
- "Manual Override" button → calls `POST /api/learning/upscale`
- Real-time polling every 30s via `setInterval`

#### `showcase.astro` — Standardization Gallery (`/learning/showcase`)
- Cards listing `.agent/rules/*.md` files
- Each card: file name, rule summary, adherence score across tracked repos
- CTA: "Trigger Standardization Upscale"

### 8.3 Component Architecture

```
frontend/src/components/learning/
├── InsightCard.tsx          — single insight card (Shadcn Card + severity badge)
├── InsightGrid.tsx          — responsive grid wrapper with filter state
├── SessionRow.tsx           — collapsible table row
├── BabysitterSessionCard.tsx — live session card with override button
├── PatternDistributionChart.tsx — Recharts BarChart
└── InsightTrendChart.tsx    — Recharts AreaChart
```

---

## Infrastructure Automation

### `package.json` — New `db:auto` Script

```json
{
  "scripts": {
    "db:auto": "pnpm run db:generate:all && pnpm run migrate:local:all && wrangler types"
  }
}
```

Zero-touch pipeline: generate Drizzle migrations → apply locally → regenerate TypeScript Worker types.

### `wrangler.jsonc` — Full Additions Summary

```jsonc
{
  // Add to existing "migrations" array (or create if not present):
  "migrations": [
    {
      "tag": "v1_sentinel",
      "new_sqlite_classes": ["LearningAgent"]
    }
  ],

  // Add Vectorize binding:
  "vectorize": [
    {
      "binding": "VECTORIZE_INDEX",
      "index_name": "sentinel-patterns"
    }
  ],

  // Add Workflow binding:
  "workflows": [
    {
      "name": "LearningWorkflow",
      "binding": "LEARNING_WORKFLOW",
      "class_name": "LearningWorkflow",
      "script_name": "core-github-api"
    }
  ],

  // Add cron trigger:
  "triggers": {
    "crons": ["0 6 * * *"]
  }
}
```

**Note:** `JULES_API_KEY` should be added to `secrets_store_secrets` following the existing pattern in `wrangler.jsonc`.

### New `.agent/rules/durable_objects.md`

```markdown
# Rule: Durable Objects with SQLite State

NEVER use `new_classes` for SQLite-backed Durable Objects.
ALWAYS use `new_sqlite_classes` in the migrations array.

**Wrong:**
```jsonc
"durable_objects": { "bindings": [{ "class_name": "MyAgent" }] }
```

**Correct:**
```jsonc
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyAgent"] }]
```

**Why:** `new_classes` does not initialize the SQLite storage layer.
Any class extending `Agent` from `@cloudflare/agents` REQUIRES `new_sqlite_classes`.
Violation causes runtime errors: "SQLite storage not available."
```

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `wrangler.jsonc` | Add `migrations[new_sqlite_classes]`, `vectorize`, `workflows`, `triggers.crons` |
| `package.json` | Add `db:auto` script |
| `backend/src/db/schemas/github/index.ts` | Add `export * from './learning'` |
| `backend/src/db/schema.ts` | Import and include learning schemas |
| `backend/src/index.ts` | Mount `/api/learning`, `/api/sentinel`, `/api/governance` routers |
| `backend/src/types/env.d.ts` | Add `VECTORIZE_INDEX: VectorizeIndex`, `LEARNING_WORKFLOW: Workflow` |

---

## Technical Standards Cheat Sheet

| Category | Rule |
|----------|------|
| AI SDK | `env.AI.run(...)` Workers AI only — NEVER `@vercel/ai` or Vercel AI SDK |
| Durable Objects | `new_sqlite_classes` — NEVER `new_classes` for state-bearing DOs |
| GitHub auth | `GITHUB_PERSONAL_ACCESS_TOKEN` for PR comments — NEVER GitHub App token |
| Frontend borders | NONE — use `bg-zinc-*` tonal depth only |
| Hono routes | `OpenAPIHono` + `createRoute` + Zod — no plain `app.get(...)` |
| Error handling | No empty catch blocks — always log or handle |
| Health endpoints | Mandatory `GET /health/learning` on all new services |
| Frontend pages | One `.astro` file per view — no multi-tab monoliths |
| Schema files | One Drizzle file per table in `backend/src/db/schemas/github/learning/` |

---

## Verification Checklist

After agent execution, confirm in order:

1. **`pnpm run db:auto`** — generates migrations, applies locally, regenerates types → zero errors
2. **`pnpm run check`** — TypeScript passes with no type errors
3. **`pnpm dev`** → navigate to `/learning/dashboard` → Zinc-950 background, no visible borders, charts load
4. **`curl -X POST localhost:8787/api/learning/sync`** → returns `{ sessionId: "...", status: "started" }`
5. **`curl localhost:8787/health/learning`** → returns `{ status: "healthy", lastRun: "...", insightCount: 0 }`
6. **Open a test PR** in any monitored repo → sentinel-handler posts comment using persona token within 10s
7. **Simulate apology loop** in a Jules session → `JulesOverseer` detects doom loop, injects `[SYSTEM OVERRIDE]` → verify entry in `learning_ai_insights`
8. **`curl -X POST localhost:8787/api/governance/analyze`** with `conversations.json` body → returns insight array
9. **Confirm** `docs/20260329/continuous_improvement/v2/` contains all 5 artifacts
