# implement_project_tasks_services.md
# Agent-Native Project Task Management — Implementation Plan (v2, Antigravity-Aligned)

> **Date:** 2026-03-31
> **Revision:** v2.3 — Full table consolidation; pm_* → backlog (epics/stories/tasks); BabysitterAgent folded into JulesOverseer; D1 seeded ✅
> **Status:** Ready for Agent Execution
> **Auth Keys:** `AGENTIC_WORKER_API_KEY` (agents) · `WORKER_API_KEY` (internal services)
> **Live Worker:** `https://core-github-api.hacolby.workers.dev`
> **D1 DB ID:** `4db39958-8554-4da4-b23d-8a4ea8404588`

---

## Schema Audit Findings

A full audit of `src/backend/src/db/schemas/` revealed overlapping table hierarchies created across multiple AI coding sessions. The canonical table map is:

| Use Case | Canonical Tables | Source File |
|----------|-----------------|-------------|
| Frontend backlog at `/repos/:owner/:repo/projects/` | `epics` → `stories` → `tasks` | `schemas/projects/backlog/` |
| **Agent task tracking / Sentinel tasks** | **`tasks` (backlog) with `assignee`** | `backlog/tasks.ts` |
| Agent task audit trail | `taskEvents` | `backlog/tasks.ts` |
| Workshop wizard phased plans | `workshopProjectTasks` + `workshopTaskEvents` | `schemas/workshop/` |
| PM hierarchy (meta-level) | `pm_projects`/`pm_epics`/`pm_stories`/`pm_tasks` | D1 only (seeded); no main-source routes |

### Decision: `tasks` (backlog) is the agent task table

The existing `tasks` table already has:
- `assignee TEXT` — set to `"jules:session-abc123"` or `"stitch:project-xyz"`
- `kanbanColumn` — `backlog|todo|in_progress|in_review|done`
- `status` — `todo|in_progress|done|backlog|cancelled`
- `priority` — `low|medium|high|critical|urgent`
- `githubIssueId` — for GitHub sync
- `taskEvents` — audit trail with `eventType`, `oldValue`, `newValue`, `fieldName`

**Zero new tables. Zero schema migrations for task management.**

The `pm_*` tables seeded to D1 represent Sentinel's own project meta-tasks (8 epics, 5 stories, 7 tasks for `proj-sentinel-001`). These remain valid as meta-level project planning data but are NOT the backend for the agent-facing REST API.

---

## Architecture: Antigravity-Aligned

### What Already Exists (Zero-New-Resource Principle)

| Component | File | Role |
|-----------|------|------|
| `tasks` table | `backlog/tasks.ts` | Agent task backend — already has `assignee`, `kanbanColumn` |
| `taskEvents` | `backlog/tasks.ts` | Audit trail |
| `JulesOverseer` DO | `backend/src/ai/agents/JulesOverseer.ts` | **Single orchestrator** — extend, not replace |
| `JulesWebhookBroadcaster` | `backend/src/do/JulesWebhookBroadcaster.ts` | WS fan-out — already has `/ws` + `/internal/broadcast` |
| `JUDGE_AGENT` binding | `wrangler.jsonc:255` | Task verification — already bound |
| `AGENTIC_WORKER_API_KEY` | `wrangler.jsonc:152` | Agent bearer auth |
| `WORKER_API_KEY` | `wrangler.jsonc:147` | Internal service auth |
| `GH_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | `wrangler.jsonc` | PR Interceptor human-persona |
| `JULES_WEBHOOK_BROADCASTER` binding | `wrangler.jsonc:330` | WS broadcast |
| Existing planner routes | `routes/api/frontend/planner/tasks.ts` | Pattern to follow |

### What to Build

1. `/api/sentinel/*` REST API — new Hono route file using `tasks` + `taskEvents`
2. Extend `JulesOverseer` — doom-loop detection, task broadcast, `/ingest` endpoint
3. Extend `JulesWebhookBroadcaster` — add `projectId` filter support
4. `scripts/sentinel-agent.sh` — agent CLI for bash-level task management

---

## Context: Why Agents Need This

Agents like Jules and Stitch need to:
1. **List** assigned tasks (with full hierarchy context)
2. **Claim** a task (mark as `in_progress`, set `assignee`)
3. **Update** status throughout their work lifecycle
4. **Collaborate** with other agents via real-time broadcasts
5. **Ask for clarification** from the orchestrator (`JulesOverseer`)
6. **Submit work** for review by `JUDGE_AGENT`

---

## Phase 1 — REST API: `/api/sentinel/*`

**File to create:** `src/backend/src/routes/api/sentinel/index.ts`

Use `OpenAPIHono` with `createRoute` + Zod, following the pattern in `src/backend/src/routes/api/frontend/planner/tasks.ts`.

### Auth Middleware

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const sentinel = new OpenAPIHono<{ Bindings: Env }>();

sentinel.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (token !== c.env.AGENTIC_WORKER_API_KEY && token !== c.env.WORKER_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
```

### Route Inventory

| Method | Path | Purpose | DB Operation |
|--------|------|---------|--------------|
| GET | `/api/sentinel/tasks/available` | Unclaimed tasks (assignee IS NULL, status=todo) | SELECT tasks WHERE assignee IS NULL AND status='todo' |
| GET | `/api/sentinel/tasks/:id` | Single task with story + epic context | SELECT tasks + stories + epics JOIN |
| POST | `/api/sentinel/tasks/:id/claim` | Assign agent to task | UPDATE tasks SET assignee, status='in_progress'; INSERT taskEvents |
| PATCH | `/api/sentinel/tasks/:id` | Update status/notes | UPDATE tasks; INSERT taskEvents; broadcast |
| POST | `/api/sentinel/tasks/:id/submit` | Mark in_review, dispatch JUDGE_AGENT | UPDATE tasks; broadcast; dispatch judge |
| POST | `/api/sentinel/tasks/:id/clarify` | Broadcast clarification request | Broadcast via JULES_WEBHOOK_BROADCASTER |
| GET | `/api/sentinel/status` | Live Jules session + task summary | JulesOverseer status + D1 aggregates |
| POST | `/api/sentinel/ingest` | Receive LearningAgent insights | INSERT learning_ai_insights |
| GET | `/health/sentinel` | Health check | SELECT 1 |

### Key Route Details

#### `POST /api/sentinel/tasks/:id/claim`
```typescript
// Body: { agentId: string, agentType: 'jules'|'stitch'|'orchestrator' }
// 1. UPDATE tasks SET assignee = agentId, status = 'in_progress' WHERE id = :id AND assignee IS NULL
// 2. INSERT taskEvents (eventType='status_change', oldValue='todo', newValue='in_progress', fieldName='status')
// 3. INSERT taskEvents (eventType='assignee_change', oldValue=null, newValue=agentId, fieldName='assignee')
// 4. Broadcast: JULES_WEBHOOK_BROADCASTER.fetch('/internal/broadcast', { type: 'task_claimed', taskId, agentId, projectId })
// Returns: { success: true, task: updatedTask }
// Guard: if assignee already set, return 409 Conflict
```

#### `PATCH /api/sentinel/tasks/:id`
```typescript
// Body: { status?: string, agentNotes?: string, kanbanColumn?: string }
// 1. UPDATE tasks (only provided fields)
// 2. INSERT taskEvents for each changed field
// 3. Broadcast: { type: 'task_updated', taskId, changes, agentId }
```

#### `POST /api/sentinel/tasks/:id/submit`
```typescript
// Body: { agentNotes: string, prUrl?: string }
// 1. UPDATE tasks SET status='in_review', description=agentNotes
// 2. INSERT taskEvents (status_change → 'in_review')
// 3. Broadcast: { type: 'task_submitted', taskId, agentId, prUrl }
// 4. Dispatch JUDGE_AGENT:
const judgeId = env.JUDGE_AGENT.idFromName('task-reviewer');
const judgeStub = env.JUDGE_AGENT.get(judgeId);
await judgeStub.fetch('http://agent/review', {
  method: 'POST',
  body: JSON.stringify({ taskId, taskTitle: task.title, agentNotes, prUrl }),
});
// 5. Add internal callback route: POST /api/sentinel/tasks/:id/review-result (WORKER_API_KEY only)
//    → UPDATE tasks SET status=result, review notes; broadcast review_complete
```

#### `POST /api/sentinel/tasks/:id/clarify`
```typescript
// Body: { question: string, agentId: string }
// Broadcast: { type: 'clarification_request', taskId, agentId, question }
// JulesOverseer (subscribed to broadcasts) receives this and:
//   → calls runAgentText() to answer
//   → broadcasts: { type: 'clarification_response', taskId, answer }
```

### Mount in Route Assembly

In `src/backend/src/routes/index.ts`, add:
```typescript
import sentinelApi from './api/sentinel';
// ...
.route('/api/sentinel', sentinelApi)
```

---

## Phase 2 — Extend `JulesOverseer`

**File:** `backend/src/ai/agents/JulesOverseer.ts`

Add the following capabilities to the existing `JulesOverseer` DO. Do NOT replace — append to existing `onRequest`/`handleAction` pattern.

### 2.1 Doom-Loop Detection

In the existing session message polling loop, add after reading messages:

```typescript
private async detectDoomLoop(sessionId: string, messages: Message[]): Promise<boolean> {
  const APOLOGY_PATTERNS = [
    /i apologize/i, /i'm sorry/i, /my oversight/i,
    /same error/i, /let me try again/i, /i made a mistake/i
  ];
  const recentMessages = messages.slice(-10);
  const apologyCount = recentMessages.filter(m =>
    APOLOGY_PATTERNS.some(p => p.test(m.content))
  ).length;
  return apologyCount >= 3;
}
```

When `detectDoomLoop` returns `true`:
1. Call `JulesService.sendMessage(sessionId, "[SYSTEM OVERRIDE]: Stop apologizing. Identify the root cause. Check .agent/rules/ for the relevant guardrail. Apply the fix exactly once.")`
2. Log a `taskEvent` if the session has an associated task (`assignee = 'jules:' + sessionId`)
3. Broadcast: `{ type: 'system_override', sessionId, reason: 'doom_loop_detected' }` via `JULES_WEBHOOK_BROADCASTER`

### 2.2 Broadcast Subscriber (Clarification Responses)

Add `fetch` handler for `POST /ingest`:

```typescript
// Receives broadcast messages from JulesWebhookBroadcaster when type='clarification_request'
// Runs runAgentText() to formulate an answer
// Calls JULES_WEBHOOK_BROADCASTER.fetch('/internal/broadcast', clarification_response)
```

### 2.3 `/ingest` Endpoint

Handle `POST /ingest` in the DO's `onRequest`:
```typescript
case '/ingest': {
  // Body: { type: 'insight', patternType, severity, description, affectedSessions[] }
  // INSERT learning_ai_insights (table from Phase 1 of implementation_plan_v2.md)
  // Broadcast: { type: 'new_insight', insight }
}
```

---

## Phase 3 — Extend `JulesWebhookBroadcaster`

**File:** `backend/src/do/JulesWebhookBroadcaster.ts`

Add `projectId` subscription filtering so agents only receive relevant broadcasts.

### 3.1 Add Subscribe Message Type

When a client sends `{"type":"subscribe","projectId":"<id>"}` after connecting, store the `projectId` in `WebSocketMeta`:

```typescript
// In handleMessage:
if (message.type === 'subscribe' && message.projectId) {
  // Update WeakMap entry for this socket with projectId
  const meta = socketMeta.get(ws);
  if (meta) socketMeta.set(ws, { ...meta, projectId: message.projectId });
}
```

### 3.2 Filtered Broadcast in `/internal/broadcast`

When `POST /internal/broadcast` receives a message with `projectId`, only fan-out to subscribers that match:

```typescript
// In /internal/broadcast handler:
const { projectId, ...payload } = body;
for (const ws of this.ctx.getWebSockets()) {
  const meta = socketMeta.get(ws);
  if (!projectId || meta?.projectId === projectId || meta?.projectId === 'system:all') {
    ws.send(JSON.stringify(payload));
  }
}
```

### 3.3 Auth on WebSocket Upgrade

Add `apiKey` query param validation before accepting upgrade in `GET /ws`:

```typescript
const apiKey = url.searchParams.get('apiKey');
if (apiKey !== this.env.AGENTIC_WORKER_API_KEY && apiKey !== this.env.WORKER_API_KEY) {
  return new Response('Unauthorized', { status: 401 });
}
```

### WS Connection Pattern for Agents

```
wss://core-github-api.hacolby.workers.dev/ws/jules?apiKey={AGENTIC_WORKER_API_KEY}

// After connect, send:
{"type":"subscribe","projectId":"proj-sentinel-001"}

// Now receives only broadcasts for proj-sentinel-001
// Also subscribe to system:all for fleet-wide announcements:
{"type":"subscribe","projectId":"system:all"}
```

Note: `JulesWebhookBroadcaster` is a singleton (`idFromName("jules-broadcaster")`). The `projectId` subscription replaces the need for separate `RoomDO` instances per project.

---

## Phase 4 — Single Orchestrator Pattern

`JulesOverseer` is the privileged orchestrator DO. For multi-repo scenarios, instantiate per-repo:

```typescript
const overseerId = env.JULES_OVERSEER.idFromName(`overseer-${repoId}`);
const overseer = env.JULES_OVERSEER.get(overseerId);
```

For cross-repo (fleet-wide) orchestration, use the global instance:
```typescript
const overseer = env.JULES_OVERSEER.get(env.JULES_OVERSEER.idFromName('global-overseer'));
```

Sub-orchestrators (Jules sessions, Stitch projects) receive their task assignment and WS credentials from the global overseer, then operate independently — broadcasting task updates to `JulesWebhookBroadcaster` which the overseer monitors.

### Orchestrator Instruction to Sub-Agent (Jules Prompt Template)

```
## Task Assignment

You have been assigned: {taskId} — "{taskTitle}"

**Before starting:**
  source /path/to/sentinel-agent.sh
  SENTINEL_AGENT_ID="{julesSessionId}" sentinel_claim_task {taskId} jules

**During work, update status:**
  sentinel_update_task {taskId} in_progress "Brief status note"

**If you hit a blocker or need clarification:**
  sentinel_ask {taskId} "Your specific question"

**When complete:**
  sentinel_submit {taskId} "Summary of what was implemented" "{prUrl}"

**Environment:**
  SENTINEL_API_URL=https://core-github-api.hacolby.workers.dev
  SENTINEL_API_KEY={AGENTIC_WORKER_API_KEY value}
  SENTINEL_AGENT_ID={julesSessionId}

**WebSocket (for real-time collaboration):**
  wss://core-github-api.hacolby.workers.dev/ws/jules?apiKey={AGENTIC_WORKER_API_KEY}
  After connect: {"type":"subscribe","projectId":"{projectId}"}
```

---

## Phase 5 — Agent Script: `scripts/sentinel-agent.sh`

Deploy to `core-github-standardization/scripts/sentinel-agent.sh`. All agents working in repos standardized by this fleet tool will have it available.

```bash
#!/usr/bin/env bash
# sentinel-agent.sh — Sentinel Task Management CLI v2
# Usage: source sentinel-agent.sh (sets up functions in shell)
# Requires env vars: SENTINEL_API_KEY, SENTINEL_API_URL, SENTINEL_AGENT_ID

SENTINEL_API_URL="${SENTINEL_API_URL:-https://core-github-api.hacolby.workers.dev}"
SENTINEL_API_KEY="${SENTINEL_API_KEY:-}"
SENTINEL_AGENT_ID="${SENTINEL_AGENT_ID:-$(hostname)-$$}"

_sentinel_curl() {
  local method="$1" path="$2" body="${3:-}"
  curl -sf -X "$method" "${SENTINEL_API_URL}${path}" \
    -H "Authorization: Bearer ${SENTINEL_API_KEY}" \
    -H "Content-Type: application/json" \
    ${body:+-d "$body"}
}

# List available (unclaimed) tasks for this repo
sentinel_list_tasks() {
  local repo_id="${1:-}"
  local path="/api/sentinel/tasks/available"
  [[ -n "$repo_id" ]] && path="${path}?repoId=${repo_id}"
  echo "=== Available Tasks ===" && _sentinel_curl GET "$path"
}

# Claim a task — sets in_progress + assigns this agent
sentinel_claim_task() {
  local task_id="$1" agent_type="${2:-jules}"
  echo "=== Claiming: ${task_id} ==="
  _sentinel_curl POST "/api/sentinel/tasks/${task_id}/claim" \
    "{\"agentId\":\"${SENTINEL_AGENT_ID}\",\"agentType\":\"${agent_type}\"}"
}

# Update task status and/or notes
sentinel_update_task() {
  local task_id="$1" status="$2" notes="${3:-}"
  _sentinel_curl PATCH "/api/sentinel/tasks/${task_id}" \
    "{\"status\":\"${status}\",\"agentNotes\":\"${notes}\"}"
}

# Ask orchestrator for clarification (broadcasts to JulesOverseer)
sentinel_ask() {
  local task_id="$1" question="$2"
  echo "=== Asking Orchestrator: ${question} ==="
  _sentinel_curl POST "/api/sentinel/tasks/${task_id}/clarify" \
    "{\"question\":\"${question}\",\"agentId\":\"${SENTINEL_AGENT_ID}\"}"
}

# Submit task for Judge review
sentinel_submit() {
  local task_id="$1" notes="$2" pr_url="${3:-}"
  echo "=== Submitting: ${task_id} for review ==="
  _sentinel_curl POST "/api/sentinel/tasks/${task_id}/submit" \
    "{\"agentNotes\":\"${notes}\",\"prUrl\":\"${pr_url}\",\"agentId\":\"${SENTINEL_AGENT_ID}\"}"
}

# Get task detail with hierarchy context
sentinel_get_task() {
  local task_id="$1"
  _sentinel_curl GET "/api/sentinel/tasks/${task_id}"
}

# Get sentinel system status
sentinel_status() {
  _sentinel_curl GET "/api/sentinel/status"
}

echo "✅ Sentinel Agent CLI v2 loaded. Agent: ${SENTINEL_AGENT_ID}"
echo "   Commands: sentinel_list_tasks, sentinel_claim_task, sentinel_update_task, sentinel_ask, sentinel_submit, sentinel_get_task, sentinel_status"
```

---

## Phase 6 — Verification Checklist

### Pre-Deploy Checks
```bash
pnpm run check           # TypeScript: 0 errors
pnpm run db:auto         # Migrations + types (no new migrations needed for task tracking)
```

### REST API Tests
```bash
export API_KEY="<AGENTIC_WORKER_API_KEY value>"
BASE="https://core-github-api.hacolby.workers.dev"

# 1. Health check
curl "$BASE/health/sentinel"
# Expected: { status: "healthy" }

# 2. List available tasks (tasks with assignee IS NULL in D1)
curl "$BASE/api/sentinel/tasks/available" \
  -H "Authorization: Bearer $API_KEY"
# Expected: array of unassigned tasks from `tasks` table

# 3. Claim a task
curl -X POST "$BASE/api/sentinel/tasks/{task-id}/claim" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"test-agent-001","agentType":"jules"}'
# Expected: { success: true, task: { status: "in_progress", assignee: "test-agent-001" } }

# 4. Auth failure
curl "$BASE/api/sentinel/tasks/available" \
  -H "Authorization: Bearer bad-key"
# Expected: 401

# 5. Submit for review
curl -X POST "$BASE/api/sentinel/tasks/{task-id}/submit" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentNotes":"Implementation complete","prUrl":"https://github.com/jmbish04/core-github-api/pull/123"}'
# Expected: { success: true } + JUDGE_AGENT dispatched
```

### WebSocket Test
```bash
# Connect to JulesWebhookBroadcaster (already deployed)
wscat -c "wss://core-github-api.hacolby.workers.dev/ws/jules?apiKey=$API_KEY"
# After connect, subscribe:
> {"type":"subscribe","projectId":"proj-sentinel-001"}
# Expected: subscription ack, then receive task broadcasts as agents update status
```

### Agent Script Test
```bash
export SENTINEL_API_KEY="<AGENTIC_WORKER_API_KEY>"
export SENTINEL_API_URL="https://core-github-api.hacolby.workers.dev"
export SENTINEL_AGENT_ID="test-agent-$(date +%s)"
source scripts/sentinel-agent.sh

sentinel_list_tasks        # Returns unclaimed tasks from `tasks` table
sentinel_claim_task {id} jules
sentinel_update_task {id} in_progress "Testing the CLI"
sentinel_ask {id} "Should the db:auto script include migrate:remote as well?"
sentinel_submit {id} "Script verified" "https://github.com/..."
```

---

## Files to Create / Modify

| File | Action | Notes |
|------|--------|-------|
| `src/backend/src/routes/api/sentinel/index.ts` | **CREATE** | Full sentinel REST API using `tasks` + `taskEvents` |
| `src/backend/src/routes/index.ts` | **MODIFY** | Add `.route('/api/sentinel', sentinelApi)` |
| `backend/src/ai/agents/JulesOverseer.ts` | **MODIFY** | Doom-loop detection, broadcast, `/ingest` endpoint |
| `backend/src/do/JulesWebhookBroadcaster.ts` | **MODIFY** | `projectId` subscription filter + auth on upgrade |
| `scripts/sentinel-agent.sh` | **CREATE** | Agent CLI (v2, `/api/sentinel/*` endpoints) |
| `core-github-standardization/scripts/sentinel-agent.sh` | **CREATE** | Fleet copy via standardization PR |
| `package.json` | **VERIFY/ADD** | Confirm `db:auto` = `pnpm run db:generate:all && pnpm run migrate:local:all && wrangler types` |

**NOT needed (Antigravity-aligned):**
- ~~No new Durable Objects~~ — extend `JulesOverseer` only
- ~~No new wrangler.jsonc bindings~~ — all bindings already exist
- ~~No schema migrations for task management~~ — `tasks` + `taskEvents` already deployed
- ~~No `pm_*` routes in main source~~ — `pm_*` tables are meta-level only; existing backlog routes serve `/repos/:owner/:repo/projects/`

---

## Technical Standards Checklist

- [ ] All `/api/sentinel/*` routes require `AGENTIC_WORKER_API_KEY` OR `WORKER_API_KEY` bearer token
- [ ] WS upgrade on `JulesWebhookBroadcaster` validates `apiKey` query param before accepting
- [ ] Task broadcasts fire on every PATCH/claim/submit to `tasks`
- [ ] `JudgeAgent` dispatched on every task submission (`status → in_review`)
- [ ] `taskEvents` row inserted for every field change (eventType, oldValue, newValue, fieldName)
- [ ] `sentinel-agent.sh` exported into `core-github-standardization/scripts/`
- [ ] Every Jules/Stitch prompt template includes sentinel task instructions (claim → update → submit)
- [ ] `GET /health/sentinel` returns healthy
- [ ] `JulesOverseer` doom-loop threshold: ≥3 apology patterns in last 10 messages
- [ ] `[SYSTEM OVERRIDE]` injection logged as `taskEvent` when session has associated task
- [ ] No `new_classes` — any new DOs use `new_sqlite_classes` (no new DOs in this plan)
- [ ] No borders in frontend changes (Zinc-950 backgrounds, tonal depth only)
