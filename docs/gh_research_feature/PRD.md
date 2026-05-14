# PRD: GitHub Research Feature + AgenticSession Service

**Status:** Approved, ready for implementation
**Branch target:** `feat/gh-research-and-agentic-session` (off `feat/v8.1-migration` checkpoint)
**Owners:** Justin (product), current-agent (orchestration), Jules (execution per EPIC)
**Last updated:** 2026-05-14

---

## 1. Context and motivation

The core-github-api Cloudflare Worker is Justin's CI/CD and AI-agent guardrail hub. Today it can:
- Run multi-source research via the `ResearchAgent` (web + GitHub + Discord) with a single-shot summary
- Poll tracked sources on cron and email a daily/weekly digest
- Orchestrate Jules sessions for engineering work via `EngineerAgent`
- Run a Sandbox container (`@cloudflare/sandbox`) for code execution

What it **cannot** do today, and what this feature delivers:

| Capability gap | Why it matters |
|---|---|
| Clone real repos and *read code* | The GitHub code search API caps at 10 req/min — useless for deep research. Clone-and-grep is unlimited locally. |
| Iteratively refine a research plan | One-shot search loses the "found a clue, follow it" research instinct that humans use. |
| Three-mode workflow (on-demand, pre-planning, weekly) | Today's research surface is one-shot only. Different intents need different breadth/depth/cost profiles. |
| Library of accumulated knowledge | Findings disappear after the summary. A real library compounds — saved searches, categories, vector lookup, fitness signals. |
| Transparency — see what the agent is doing in real time | Agents work in silence. The user wants the "librarian at the card catalog" experience: every thought, search, read, reflection visible as it happens. |
| Send findings to planning / promote to rules | The library should *feed* the rest of the system — auto-becoming PRDs for the OrchestratorAgent and enforceable rules in AGENTS.md / `.agent/rules/`. |
| Unified websocket-session substrate | Three legacy implementations (`JulesWebhookBroadcaster`, `RoomDO`, `AgentSessionDO`) overlap. Consolidate into one reusable service used here and by every future agentic workflow. |
| On-demand health verification | Full-pipeline health check is too expensive to run on a cron — user wants a manual "run the suite" button. |
| Native shadcn discipline | Some existing pages drift from native shadcn into custom lookalikes. Audit and fix as part of this feature. |

The feature is largely **additive** — most primitives exist (Sandbox binding, JulesResearchWorkflow, RESEARCH_INDEX vectorize, research tables, cron, HITL queue, peer-agent deliberation). The work is plumbing + a major UX surface + documentation + governance.

---

## 2. Goals and non-goals

### Goals

1. **Three-mode GitHub research** — on-demand (3 min budget), pre-planning (15 min budget), weekly-awareness (30 min budget, cron-driven)
2. **Sandbox-based clone-and-grep** — repos are cloned into `@cloudflare/sandbox` containers, the agent reads README + critical files + grep hits before summarizing
3. **Iterative refinement** — plan → search → read → reflect → refine → synthesize, with explicit stopping criteria
4. **Jules synthesis** — heavy reading + report generation happens in Jules' 1M-context VM, not in the worker
5. **Library UX** — every finding tagged, categorized, searchable (text + vector), and re-runnable via saved searches
6. **Real-time transparency** — every workflow step publishes a structured event consumers can subscribe to
7. **Library → planning / rules pipeline** — multi-select findings → send to OrchestratorAgent as a brief, or promote into `.agent/rules/*.md` via PR
8. **AgenticSession reusable service** — one DO, one D1 schema, one frontend hook for all real-time agentic UIs
9. **On-demand-only health suite** — a one-button verification of the entire pipeline, never on a cron
10. **Documentation suite** — `/docs/research/*` and `/docs/agentic-session/*` for developers
11. **Native shadcn audit** — every page uses real shadcn primitives, Monolith profile (dark, OKLCH chart palette, no 1px borders, ring-1 / divide-y / bg-card separators)
12. **Governance** — AGENTS.md updated, three new `.agent/rules/*.md` files added, so future agent sessions maintain the feature correctly

### Non-goals (v1)

- **Discord ingestion** — no official search API, requires bot with privileged intent, ToS gray area. Existing Discord polling stays as-is; can re-add behind a feature flag later.
- **Multi-tenant auth** — single-user (Justin) for now; AgenticSession grants are per-session, not workspace-tier
- **Mobile app** — responsive web only; no native iOS/Android
- **Editing rules inline** — Promote-to-Rules opens a PR; rules are edited via normal review flow, not in-app
- **Cron-driven health checks** — explicitly out of scope; manual only

---

## 3. Three use cases

### 3.1 On-demand research

**Trigger:** User submits a specific question from the intake page or via `POST /api/research/gh/jobs` with `mode=on-demand`.

**Budget:** breadth 5, depth 1, wall-clock 3 min, no Jules synthesis (optional flag to enable for harder questions).

**Output:** Short report with 3–10 source cards, fit/partial/miss labels writable by the user, full transcript in the session viewer.

**Example prompts:**
- "How do people structure Cloudflare Agents SDK skills?"
- "Find Drizzle migration patterns for SQLite columns with NOT NULL added to existing tables"
- "What's the right way to call AI Gateway from a Workflow step?"

### 3.2 Pre-planning research

**Trigger:** User submits at the start of a new project from intake or via API.

**Budget:** breadth 8, depth 3, wall-clock 15 min, **Jules synthesis required** (clones top-3 repos into Jules' VM for code-level reading).

**Output:** Long-form research report with curated patterns and recommended approaches, vector-indexed into `RESEARCH_INDEX`. Optionally auto-promotes to a planning brief in OrchestratorAgent if the user enabled the toggle on the saved search.

**Example prompts:**
- "Best practices for building smart home IoT sensor aggregation on Cloudflare Workers with Durable Object snapshots"
- "Patterns for shadcn on Cloudflare with Astro SSR + React islands"
- "How others structure container-based code-execution agents (Devin, OpenHands, Cursor background agents)"

### 3.3 Weekly general awareness

**Trigger:** Weekly cron (reuses existing daily 9am UTC orchestrator, Monday-gated).

**Budget:** breadth 12, depth 2, wall-clock 30 min, Jules synthesis required.

**Output:** Markdown digest emailed via `SEND_EMAIL_NEWSLETTER` with a deep-link to the job page. Dedup via `gh_research_sources_seen` ensures no repeat content week-over-week. The killer feature is the *what's new compared to last week* delta.

**Sources scanned:** GitHub trending repos for keywords ("Cloudflare Workers", "Agents SDK", "shadcn"), the Cloudflare Discourse forum (via existing Community MCP), the user's tracked sources, and any sources tagged with categories where `is_rule_eligible=true`.

---

## 4. AgenticSession service (foundation)

The reusable transparency backbone every long-running agentic operation publishes into. Replaces three overlapping legacy implementations.

### 4.1 Data model

| Table | Purpose |
|---|---|
| `sessions` | One row per logical session; kind = `gh-research` / `jules` / `sprint` / `hitl-deliberation` / `generic` |
| `session_events` | Append-only event log; monotonic seq per session; discriminated-union event types |
| `session_subscribers` | Who's listening; humans, agents, external systems |
| `session_grants` | Authorization scopes (subscribe / publish / admin) with optional expiry |

Full schema in §10 (Database schema). Migration `0013-agentic-session.sql`.

### 4.2 Public API surface

**Backend (TypeScript module `@/services/agentic-session`):**

```ts
import { getSession, createSession, SessionClient } from '@/services/agentic-session';

// Create a session
const session = await createSession(env, {
  kind: 'gh-research',
  title: 'Research: how do people build smart home aggregators',
  ownerUserId: 'user:justin',
});

// Publish an event
await session.publish({
  type: 'agent.thought',
  actor: 'agent:Research',
  payload: { round: 2, message: 'Found 3 candidate repos, picking top 2 for deep read' },
});

// Subscribe an agent for wake-on-event
await session.subscribeAgent({
  subscriberAgent: 'OrchestratorAgent',
  filter: { type: 'system.complete' },
  wakeRpc: 'onGhResearchComplete',
});

// Grant a user access
await session.grant({ subject: 'user:justin', scope: 'admin' });
```

**Frontend (React hook):**

```tsx
import { useAgenticSession } from '@/hooks/useAgenticSession';

const { events, status, participants, publish } = useAgenticSession(sessionId, {
  apiKey: getAuthToken(),
  filter: { types: ['agent.thought', 'agent.action', 'hitl.request'] },
});

// Render the transcript via the reusable view
<SessionTranscript sessionId={sessionId} />
```

**Websocket endpoint:** `wss://worker/api/sessions/:sessionId/ws?token=<signed-jwt>`

### 4.3 Authorization

- Owner is auto-granted `admin` on creation
- Subscribers receive short-lived signed JWTs (HMAC with `SESSION_TOKEN_SECRET`); payload `{ sessionId, subject, scope, exp }`
- On `onConnect`, DO validates JWT signature, checks subject is in `session_grants` with scope ≥ subscribe, rejects with 403 otherwise
- Internal agents (subject `agent:Foo`) don't need tokens — RPC calls are in-process

### 4.4 Migration of legacy implementations

| Legacy | Disposition |
|---|---|
| `JulesWebhookBroadcaster` | Refactor to thin wrapper that publishes Jules webhook events into the per-Jules-session AgenticSession. Frontend `JulesLiveProvider` becomes a wrapper around `useAgenticSession`. Public API of `JulesLiveProvider` unchanged for one release cycle. |
| `RoomDO` | Mark `@deprecated`; new routes redirect to `/api/sessions/...`. Delete after frontend migrates (separate cleanup PR). |
| `AgentSessionDO` | Mark `@deprecated`; the AgenticSession schema strictly supersedes it. Continue writing `research_findings` from agents but route websocket transport through AgenticSession. |
| `action-worker.ts` (Hono `upgradeWebSocket`) | Already orphaned; delete. |

---

## 5. GitHub research feature

### 5.1 Workflow lifecycle (`GhResearchWorkflow`)

For every job, regardless of mode, the workflow:

1. **Create** — insert `gh_research_jobs` row (`status=queued`), create AgenticSession (kind=`gh-research`, id = jobId), grant owner admin, grant subscribed peer agents (Orchestrator, Learning) subscribe. Publish `system.start`.
2. **Plan** — generate seed queries from the user prompt via `generateStructuredResponse`. Publish `agent.action(plan)` + `agent.result(seed_queries)`.
3. **Search round** — parallel `methods.searchGithub` + `methods.executeParallelWebQueries`. For each candidate, dedup against `gh_research_sources_seen`. Publish `agent.action(search.candidate)` per hit.
4. **Triage** — rank candidates, pick top-K (3 / 5 / 8 by mode). Publish `agent.result(triaged)`.
5. **Sandbox inspect** (top-K repos) — each emits a sequence of events:
   - `agent.action(sandbox.clone)` — `ghClone` calls `getSandbox(env.SANDBOX, jobId).gitCheckout(repoUrl, { depth: 1 })`
   - `agent.action(sandbox.grep)` — `find -maxdepth 3` for tree shape, `rg -ln <keywords>` for hits
   - `agent.result(inspection)` — structured RepoInspection (summary, key_files, patterns, code_excerpts with file:line + snippet, confidence)
   - Sandbox snapshot taken after each repo
6. **Reflect** — call reviewer model: "what's missing? contradictions? confidence?". Publish `agent.thought(reflection)`.
7. **Refine** — generate next-round queries from gaps. Publish `agent.action(refine.next_queries)`. Loop back to step 3 until any stopping criterion fires.
8. **Stopping criteria** (any one):
   - Depth budget exhausted (mode-specific)
   - Jaccard overlap ≥ 0.9 on extracted entities vs previous round
   - Wall-clock budget exhausted
   - Reviewer returns `approved: true`
   - Token budget exhausted (cumulative across the job)
9. **Synthesize** — for pre-planning and weekly modes, hand the assembled corpus to `synthesizeViaJules`:
   - Clone the queue repo (`core-github-research`) into Jules' VM
   - Push `jobs/${jobId}/` subdirectory containing inspections + reflection logs as JSON
   - Kick `JulesService.startSession` with the research-mode prompt template
   - Bridge Jules webhook events into the session (`jules.status`, `jules.event`)
10. **Persist** — write final report markdown (≤1 MB to D1 column, full to R2), persist sources to `gh_research_sources`, index findings into `RESEARCH_INDEX` Vectorize
11. **Notify** — for weekly mode, email digest via `SEND_EMAIL_NEWSLETTER`; for others, optional email opt-in. Publish `system.complete`.
12. **Cleanup** — destroy Sandbox (or leave snapshot for X hours to allow replay-driven re-queries)

### 5.2 Three modes — configuration table

| Setting | on-demand | pre-planning | weekly-awareness |
|---|---|---|---|
| Breadth (queries/round) | 5 | 8 | 12 |
| Depth (rounds) | 1 | 3 | 2 |
| Top-K repos for sandbox inspect | 3 | 5 | 8 |
| Wall-clock budget | 3 min | 15 min | 30 min |
| Jules synthesis | optional flag | required | required |
| Email on complete | optional | optional | required |
| Vector indexing | yes | yes | yes |
| Dedup against `sources_seen` | yes | yes | yes |
| Default sources | github, web | github, web | github, web, tracked-sources |

### 5.3 Library UX features

- **Saved searches** — name, mode, prompt, options. Optional `schedule_cron` so a saved search runs on its own cadence. UI to re-run on demand.
- **Categories** — user-defined tags with name, color, description, `is_rule_eligible` toggle. Many-to-many on findings.
- **Fitness signals** — thumbs (fit / partial / miss) on each source; written to `gh_research_sources.fitness_label` AND aggregated into `gh_research_sources_seen.cumulative_fitness`. Used for future ranking + dedup-weighting.
- **Vector search** — every finding indexed into `RESEARCH_INDEX` with metadata `{job_id, source_id, category_ids[]}`. "Find similar in library" lookup on every finding detail page.
- **Replay** — completed jobs queryable via `session_events`; the live viewer doubles as a replay viewer with playback scrubber.
- **Send to Planning** — multi-select N findings, write project context, submit → `OrchestratorAgent.submitBrief(userId, title, payload)` → redirect to `/planning`.
- **Promote to Rules** — multi-select N findings, choose rule scope (`AGENTS.md` or `.agent/rules/{scope}.md`), generate rule entry via structured AI, open PR with provenance footer.

### 5.4 On-demand health suite

`runGhResearchHealthSuite` — 16 structured checks. Surface: `/research/gh/health` with confirm dialog (costs money) + live results + history table. **Never** on a cron.

1. Sandbox provisioning round-trip
2. Git clone reachability (shallow clone `cloudflare/workers-sdk`)
3. Filesystem read on cloned README
4. `rg` available in container
5. GitHub REST + GraphQL rate-limit > 100
6. `gh search repos` returns ≥ 1
7. Browser Render API minimal scrape
8. Jules SDK auth (`getSessionInfo` against dummy → expect 404, not 401)
9. `JULES_RESEARCH_WORKFLOW.create` then cancel
10. Email send dry-run (or actual `[health-check]` when explicitly toggled)
11. D1 `SELECT 1` round-trip
12. Vectorize `query` with stub vector
13. R2 put/get/delete round-trip
14. AI Gateway / default model short-prompt response
15. Peer agent bindings (`LEARNING_AGENT`, `CLOUDFLARE_AGENT`, `GUARDRAIL_AGENT`) resolvable
16. End-to-end micro-job (depth=1, breadth=1, one tiny repo) reaches `complete` within 90s

Results to `gh_research_health_runs.checks_json` for trend diffing.

---

## 6. UX page inventory

All Astro routes; React island views in `src/frontend/src/views/`; Monolith design profile.

### Feature pages

| Route | View | Purpose |
|---|---|---|
| `/research/gh` | `LibraryView` | Three tabs: Jobs, Library (knowledge), Saved Searches. Search + filter + facet sidebar. |
| `/research/gh/new` | `IntakeView` | Three-mode toggle with mode-specific form fields. Save-as-saved-search. |
| `/research/gh/jobs/[id]` | `JobLiveView` | Live job viewer (librarian metaphor). Rounds timeline + activity feed + source cards + progress ring. Wraps `<SessionTranscript>`. |
| `/research/gh/jobs/[id]/replay` | `JobReplayView` | Replay mode with playback scrubber, speed control. |
| `/research/gh/findings/[id]` | `FindingDetail` | Source detail with code excerpts, tag editor, action buttons. |
| `/research/gh/saved-searches` | `SavedSearchesView` | List, edit, schedule, run-now. |
| `/research/gh/categories` | `CategoriesView` | CRUD tags with color, description, rule-eligible flag. |
| `/research/gh/weekly` | `WeeklyView` | Digest archive + configuration. |
| `/research/gh/health` | `HealthDashboard` | Run-suite button, live results, history. |
| `/research/gh/send-to-planning` | `SendToPlanningModal` | Multi-select bridge to Orchestrator. |
| `/research/gh/promote-to-rules` | `PromoteToRulesModal` | Multi-select bridge to PR generation. |
| `/sessions` | `SessionMonitor` | Global view of all active AgenticSessions. |
| `/sessions/[id]` | `<SessionTranscript>` standalone | Direct session viewer for non-feature sessions. |

### Documentation pages

| Route | Covers |
|---|---|
| `/docs/research/overview` | What this feature is, three use cases, mental model |
| `/docs/research/on-demand` | When to use, options, examples |
| `/docs/research/pre-planning` | OrchestratorAgent integration |
| `/docs/research/weekly` | Digest configuration, dedup |
| `/docs/research/library` | Categories, saved searches, vector search, fitness labels |
| `/docs/research/send-to-planning` | How findings become a brief |
| `/docs/research/promote-to-rules` | How findings become rules |
| `/docs/research/health` | What the suite checks, when to run |
| `/docs/research/architecture` | System diagram, data model, workflow lifecycle |
| `/docs/research/api` | OpenAPI-linked reference |
| `/docs/research/troubleshooting` | Common failure modes |
| `/docs/agentic-session/overview` | What it is, when to use |
| `/docs/agentic-session/api` | SessionClient + useAgenticSession reference |
| `/docs/agentic-session/auth` | Grant model, JWT issuance |
| `/docs/agentic-session/integration-guide` | How to add session transparency to a new feature |
| `/docs/agentic-session/migration-from-legacy` | Cutover plan from JulesWebhookBroadcaster / RoomDO / AgentSessionDO |

---

## 7. API surface (Hono + zod-openapi)

### AgenticSession routes (mounted at `/api/sessions`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/sessions` | Create session (returns id + signed admin token) |
| GET | `/api/sessions` | List sessions (filter by kind, status, owner) |
| GET | `/api/sessions/:id` | Session detail (state, participants, last events) |
| GET | `/api/sessions/:id/ws` | Upgrade to websocket (requires signed token) |
| GET | `/api/sessions/:id/events` | Paginated event history |
| GET | `/api/sessions/:id/subscribers` | List participants |
| POST | `/api/sessions/:id/grants` | Grant scope to subject |
| DELETE | `/api/sessions/:id/grants/:subject/:scope` | Revoke grant |
| POST | `/api/sessions/:id/events` | Publish event (requires `publish` grant or higher) |

### GH Research routes (mounted at `/api/research/gh`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/research/gh/jobs` | Create job (mode, prompt, options) → returns `{ jobId }` |
| GET | `/api/research/gh/jobs` | List jobs (paginated, filter by mode/status) |
| GET | `/api/research/gh/jobs/:id` | Job detail (status, sources, report) |
| POST | `/api/research/gh/jobs/:id/feedback` | Write `fitness_label` for a source |
| POST | `/api/research/gh/jobs/:id/send-to-planning` | Send selected findings to OrchestratorAgent |
| POST | `/api/research/gh/jobs/:id/promote-to-rules` | Open PR with selected findings as rule entries |
| GET | `/api/research/gh/findings/:id` | Finding detail (incl. R2 blob) |
| POST | `/api/research/gh/findings/:id/categories` | Tag finding with categories |
| GET | `/api/research/gh/findings/similar/:id` | Vector-similar findings |
| GET | `/api/research/gh/saved-searches` / POST / PATCH / DELETE | Saved-search CRUD |
| GET | `/api/research/gh/categories` / POST / PATCH / DELETE | Category CRUD |
| POST | `/api/research/gh/health/run` | Run the on-demand health suite |
| GET | `/api/research/gh/health/runs` | History of past health runs |

All routes use `OpenAPIHono` + zod schemas. The `/openapi.json` and `/scalar` surfaces remain dynamic.

---

## 8. Capabilities consumed (existing primitives reused)

| Capability | Source |
|---|---|
| Container clone/grep/read | `getSandbox(env.SANDBOX, jobId)` from `@cloudflare/sandbox` |
| Container image | `container/Dockerfile` (opencode, python, ts, trufflehog, bun, `rg` ensured) |
| Jules sessions | `JulesService` singleton + `JULES_RESEARCH_WORKFLOW` workflow binding |
| Web search | `methods.executeWebSearch` + `methods.executeParallelWebQueries` |
| GitHub API | `mcp/tools/github/*` (Octokit, kv-cached) |
| Email | `SEND_EMAIL_NEWSLETTER` (newsletters), `SEND_EMAIL_ALERTS` (errors) |
| Vector | `RESEARCH_INDEX` (`core-github-api-research`) |
| Cron | existing daily 9am UTC `ResearchOrchestrator` (Monday-guarded for weekly mode) |
| HITL queue | `proposeToHitl`, `requestDeliberation` |
| Peer agents | `OrchestratorAgent.submitBrief`, `LearningAgent`, `CloudflareAgent`, `GuardrailAgent` |

---

## 9. Acceptance criteria

The feature is shippable when **all** verification steps in §11 pass.

Top-line acceptance:

- [ ] `runGhResearchJob('on-demand', prompt)` reaches `complete` within 5 min and writes ≥ 3 sources
- [ ] `runGhResearchJob('pre-planning', prompt)` reaches `complete` with a Jules-generated long-form report
- [ ] Monday-gated cron tick produces a weekly digest email with deep-link
- [ ] Dedup: re-running the same prompt the next day skips already-fit sources
- [ ] Library page filters by category and shows vector-similar findings
- [ ] Live viewer streams every workflow step within 200ms of publication
- [ ] Send-to-planning produces a brief visible at `/planning`
- [ ] Promote-to-rules opens a PR with the new rule + provenance footer
- [ ] AgenticSession service handles ≥10 concurrent connections per session without dropping events
- [ ] All 16 health checks pass on a fresh deploy
- [ ] Native shadcn audit: zero lookalike imports outside `@/components/ui/*`
- [ ] AGENTS.md updated; three new `.agent/rules/*.md` files present and referenced from `PROMPT.md`
- [ ] `pnpm typecheck` clean; new vitest tests cover the four critical paths in §11.16

---

## 10. Database schema

### Migration `0013-agentic-session.sql`

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  owner_user_id TEXT,
  parent_session_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);
CREATE INDEX idx_sessions_kind_status ON sessions(kind, status);
CREATE INDEX idx_sessions_owner ON sessions(owner_user_id, created_at);

CREATE TABLE session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_session_events_seq ON session_events(session_id, seq);
CREATE INDEX idx_session_events_type ON session_events(session_id, type);

CREATE TABLE session_subscribers (
  session_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  wake_rpc TEXT,
  filter_json TEXT,
  subscribed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, subscriber_id)
);

CREATE TABLE session_grants (
  session_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  PRIMARY KEY (session_id, subject, scope)
);
```

### Migration `0012-gh-research.sql`

```sql
CREATE TABLE gh_research_jobs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  user_id TEXT,
  initial_prompt TEXT NOT NULL,
  saved_search_id TEXT,
  seed_queries TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  jules_session_id TEXT,
  report_r2_key TEXT,
  report_markdown TEXT,
  rounds_completed INTEGER DEFAULT 0,
  stop_reason TEXT,
  duration_ms INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_gh_jobs_status ON gh_research_jobs(status);
CREATE INDEX idx_gh_jobs_mode ON gh_research_jobs(mode, created_at);

CREATE TABLE gh_research_sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  inspection_r2_key TEXT,
  summary TEXT,
  relevance_score REAL,
  fitness_label TEXT,
  vector_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_gh_sources_job ON gh_research_sources(job_id);

CREATE TABLE gh_research_sources_seen (
  url TEXT PRIMARY KEY,
  first_seen_job_id TEXT,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER,
  times_seen INTEGER DEFAULT 1,
  cumulative_fitness REAL
);

CREATE TABLE gh_research_clones (
  job_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  cloned_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (job_id, repo_full_name)
);

CREATE TABLE gh_research_saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options TEXT,
  schedule_cron TEXT,
  last_run_job_id TEXT,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE gh_research_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  description TEXT,
  is_rule_eligible INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX uq_gh_categories_user_name ON gh_research_categories(user_id, name);

CREATE TABLE gh_research_source_categories (
  source_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  tagged_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (source_id, category_id)
);

CREATE TABLE gh_research_promotions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  target_ref TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE gh_research_health_runs (
  id TEXT PRIMARY KEY,
  triggered_by TEXT,
  overall_status TEXT,
  checks_json TEXT NOT NULL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- View — librarian transparency trail is just session_events for gh-research kind
CREATE VIEW v_gh_research_trail AS
  SELECT e.id, e.session_id AS job_id, e.seq AS round, e.type AS event_type,
         e.actor, e.payload_json AS payload, e.created_at
  FROM session_events e
  JOIN sessions s ON s.id = e.session_id
  WHERE s.kind = 'gh-research';
```

Drizzle schemas under `src/backend/src/db/schemas/research/gh/` and `src/backend/src/services/agentic-session/schemas/`. Per-table files with folder `index.ts` re-export — never flat dumps.

---

## 11. Verification matrix

See approved plan §Verification. 19 end-to-end checks covering AgenticSession round-trip, all three research modes, dedup, library actions, send-to-planning, promote-to-rules, health suite, replay, vectorize "find similar", docs, shadcn audit, governance, type checks, orchestrator wake-up, sessions monitor, and backward compatibility.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sandbox concurrency cap (5 instances) starves under burst | Queue jobs; surface "waiting for sandbox" in the live viewer. Increase via wrangler binding if it becomes a real bottleneck. |
| Jules session times out on large corpora | Cap per-Jules-session corpus at top-5 repos + 50k tokens of inspection notes. Spill the rest to a second Jules session if needed. |
| Vector index drift (findings become stale) | Re-index every Sunday via a low-cost workflow. Out of v1 scope; tracked as follow-up. |
| Legacy `JulesWebhookBroadcaster` consumers break during cutover | Wrapper keeps the public API stable for one release; deprecation warning in JSDoc. |
| Promote-to-Rules generates a bad rule | PR opens, doesn't auto-merge. Justin reviews + edits before merge. |
| AGENTS.md grows unboundedly | Periodic curation; rules over 90 days old without re-validation are flagged. Out of v1. |

---

## 13. Out of scope (re-stated for clarity)

- Discord ingestion
- Multi-tenant auth
- Mobile native apps
- Cron health checks
- Rule editing inside the app
- Auto-merge of promoted rules
- Multi-user simultaneous editing of categories
- Public sharing of research jobs (single-user app)
