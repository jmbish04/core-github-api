# Coding Agent Execution Prompt — Agent Consolidation Checkin #1

> **Date:** 2026-04-14
> **Context:** Post-Phase-1 agent consolidation cleanup + unified chat schema + route modularization + anti-pattern fixes + wrangler migration reset

---

## Your Mission

You are continuing the agent consolidation work on `src/backend/src/ai/agents/`. Phase 1 (Honi eradication, directory restructuring, method file creation) is complete. Your job is to execute the remaining tasks defined in `project_tasks.json` located at:

```
docs/20260414/agents_audit/checkin_1/v1/project_tasks.json
```

You **MUST** follow `project_tasks.json` as your single source of truth for what needs to be done. The accompanying `plan.md` provides architectural context and rationale.

---

## Execution Rules

### 1. Task Tracking is Mandatory

- Before starting any task, read `project_tasks.json` and update the task's `status` from `"pending"` to `"in_progress"`.
- After completing a task, update its `status` to `"completed"` **ONLY IF** all `requirements` have been delivered and all `success_criteria` have been verified.
- If a task is blocked, add a `"blocked_reason"` field to the task object and move on to the next unblocked task.
- **Reporting a task as complete means that ALL requirements for the task have been delivered and ALL success criteria for the task have been realized.** Do not mark a task complete if any requirement is unmet or any success criterion fails.

### 2. Task Ordering

- Respect the `depends_on` field in each phase. Do not start a phase until all tasks in its dependencies are `"completed"`.
- Within a phase, tasks can be executed in any order unless one task's output is needed by another.
- Phases `2a` and `2c` have no dependencies and can be started immediately (or in parallel if your agent supports it).

### 3. Quality Standards

- **NO HONI FRAMEWORK**: All agents must use Cloudflare Agents SDK (`AIChatAgent`/`Agent` from `"agents"` or `"@cloudflare/ai-chat"`). Zero references to `honi`, `HoniAgent`, or `honidev` anywhere.
- **Omni-Agent Standard**: Every agent directory must have `index.ts`, `health.ts`, `types.ts`, `methods/`. Every agent must support: AI Chat (`onChatMessage`), RPC (`@callable`), Workflow interop, WebSocket Pub/Sub (ChatRoom), Cron/Alarms (`this.schedule()`).
- **All AI calls route through `@/ai/providers`**: No direct vendor imports.
- **@callable() RPC for agent-to-agent communication**: NEVER use `agent.fetch(new Request("http://..."))` to call a Durable Object. This anti-pattern bypasses the RPC system and hits the legacy `onRequest` fallback. Use `@callable()` decorated methods and call them directly (e.g., `agent.broadcast(payload)`). The ONLY exception is SSE streaming endpoints that cannot use RPC — document these exceptions with a comment.
- **TypeScript must compile**: Run `tsc --noEmit` after each task and fix any errors before marking complete.

### 4. File Operations

- When deleting files (task A1), first grep for imports referencing those files to ensure nothing breaks.
- When creating new method files, follow the existing pattern: export a function that receives the agent instance as its first parameter, delegate from `@callable()` methods in `index.ts`.
- When modifying route files (task A4), verify the new agent has a matching `@callable()` method. If not, create one.
- When creating the chat schema (tasks B1-B4), use Drizzle ORM patterns matching the existing `chats/threads.ts` and `chats/messages.ts` conventions.

### 5. Verification After Each Phase

After completing all tasks in a phase, run these verification commands:

```bash
# TypeScript compilation
npx tsc --noEmit

# Check for stale binding references (after A4)
grep -r "GEMINI_AGENT\|DEEP_RESEARCH_CHAT_AGENT\|SUPERVISOR\|WEB_SEARCH_AGENT\|JUDGE_AGENT\|TOPIC_ORCHESTRATOR\|JULES_OVERSEER\|CLOUDFLARE_DOCS_AGENT" src/backend/src/routes src/backend/src/workflows

# Check for anti-pattern .fetch(new Request(...)) calls (after D1)
grep -rn "\.fetch(new Request(" src/backend/src/routes

# Verify export-to-wrangler alignment (after E1/E2)
# Extract all class_name values from wrangler.jsonc, confirm each has a matching export in src/backend/src/exports.ts

# Wrangler validation (after A5)
npx wrangler types
npx wrangler deploy --dry-run

# Migration test (after B4)
pnpm run migrate:local
```

### 6. What NOT to Do

- Do NOT delete `todo_integration/` directories — they are required for wrangler DO migration tags until Phase 2e (post-deploy).
- Do NOT remove the "Legacy class exports" section from `exports.ts` (lines 22-43) — required for wrangler migration.
- Do NOT delete the old D1 tables (`chat_threads`, `chat_messages`, `chat_room_logs`) — they contain historical data.
- Do NOT modify `wrangler.jsonc` migration tags unless explicitly instructed in a task.
- Do NOT create new flat `.ts` agent files in the `ai/agents/` root directory — all new code goes into the modular directory structure.

---

## Context You Need

### Current Agent Architecture
10 Omni-Agents with modular directories:
`CloudflareAgent`, `DesignAgent`, `EngineerAgent`, `GithubAgent`, `GuardrailAgent`, `LearningAgent`, `OrchestratorAgent`, `ResearchAgent`, `WorkshopAgent`, `ChatRoom`

Plus 1 being dissolved: `OverseerAgent` (responsibilities absorbed into EngineerAgent + GuardrailAgent)

### Chat Schema Architecture
Three systems being unified into `db/schemas/chats/`:
1. `db/schemas/chats/` (modern, NOT yet exported for migrations) → becoming the single source of truth
2. `db/schemas/agents/chat.ts` (old, actively used by routes) → being deprecated
3. `db/schemas/agents/mirror.ts` `chatRoomLogs` (ChatRoom D1 mirror) → being deprecated

### Key Binding Mapping (Old → New)
| Old Binding | New Binding | Notes |
|-------------|-------------|-------|
| GEMINI_AGENT | ORCHESTRATOR | General chat |
| CLOUDFLARE_DOCS_AGENT | CLOUDFLARE_AGENT | CF docs expertise |
| DEEP_RESEARCH_CHAT_AGENT | RESEARCH_AGENT | Research chat |
| SUPERVISOR | ORCHESTRATOR | Health/monitoring |
| WEB_SEARCH_AGENT | RESEARCH_AGENT | Web search |
| JUDGE_AGENT | GUARDRAIL_AGENT | Code quality judgment |
| TOPIC_ORCHESTRATOR | RESEARCH_AGENT | Topic research |
| JULES_OVERSEER | ENGINEER_AGENT | Jules oversight |

### Route Modularization (Scope C)

12 loose route files in `routes/api/` need to be moved into category subdirectories:

| Current Location | Move To |
|------------------|---------|
| `actions.ts` | `github/actions.ts` |
| `agent-planning.ts` | `agents/planning.ts` |
| `backlog.ts` | `projects/backlog.ts` |
| `continuous-learning.ts` | `learning/continuous-learning.ts` |
| `health.ts` | `ops/health-root.ts` |
| `planning.ts` | `projects/planning.ts` |
| `research-orchestration.ts` | `research/orchestration.ts` |
| `reverse-engineering.ts` | `tools/reverse-engineering.ts` |
| `sandbox.ts` | `tools/sandbox.ts` |
| `skills.ts` | `ai/skills.ts` |
| `standardization.ts` | `ops/standardization.ts` |
| `stitch.ts` | `design/stitch.ts` |

**Keep as-is:** `auth.ts` (standard convention), `index.ts` (root router). After moves, update `routes/api/index.ts` imports.

### Anti-Pattern Fixes (Scope D)

7 route files use `agent.fetch(new Request("http://..."))` which is WRONG. This bypasses `@callable()` RPC. Fix each:

| File | Line | Fix |
|------|------|-----|
| `routes/api/ux/index.ts` | 79 | DESIGN_AGENT: use `@callable() stream()` or WebSocket |
| `routes/api/webhooks/jules.ts` | 96 | JULES_WEBHOOK_BROADCASTER: `agent.broadcast(payload)` |
| `routes/api/webhooks/jules.ts` | 191 | JULES_OVERSEER → ENGINEER_AGENT: `agent.checkSchedule()` |
| `routes/api/ops/health.ts` | 69 | LEARNING_AGENT: `agent.diagnose(errorInfo)` |
| `routes/api/projects/sentinel/broadcast.ts` | 24 | JULES_WEBHOOK_BROADCASTER: `agent.broadcast(payload)` |
| `routes/api/projects/sentinel/clarify.ts` | 32 | JULES_WEBHOOK_BROADCASTER: `agent.broadcast(payload)` |
| `routes/api/projects/sentinel/submit.ts` | 84-85 | JUDGE_AGENT → GUARDRAIL_AGENT: `agent.judgeCodeQuality(...)` |

You must also ADD these missing `@callable()` methods:
- `JulesWebhookBroadcaster.broadcast(payload)` in `do/JulesWebhookBroadcaster.ts`
- `DesignAgent.stream(runId)` or document onRequest exception for SSE
- `LearningAgent.diagnose(errorInfo)` in `ai/agents/LearningAgent/index.ts`

### Wrangler Migration Reset (Scope E)

We are treating this as a **brand new worker**. Replace ALL 6 migration tags with a single fresh `v1`:

```jsonc
"migrations": [
  {
    "tag": "v1",
    "new_sqlite_classes": [
      "OrchestratorAgent", "SoftwareEngineerAgent", "GuardrailAgent",
      "ResearchAgent", "GithubAgent", "CloudflareAgent", "DesignAgent",
      "ContinuousLearningAgent", "WorkshopAgent", "ChatRoom",
      "Sandbox", "JulesWebhookBroadcaster", "PlanningMonitor",
      "ReverseEngineeringMonitor", "AgentSessionDO", "RoomDO"
    ]
  }
]
```

**Export alignment issues to fix:**
1. `LearningWorkflow` is bound in wrangler but NOT exported from `workflows/exports.ts` — **must add export or deployment fails**
2. `HitlWorkflow` is exported but NOT bound — add wrangler binding or remove export
3. Class aliases must match: `EngineerAgent as SoftwareEngineerAgent`, `StitchDesignAgent as DesignAgent`

**With fresh v1, these are no longer needed:**
- Legacy exports in `ai/agents/exports.ts` lines 22-43 → DELETE
- All `todo_integration/` directories (28 files) → DELETE
- `OverseerAgent/` directory → DELETE

---

## Begin

1. Read `project_tasks.json`
2. Start with Phase 2a tasks (A1, A2, A3, E1, E2, E3) — these have no dependencies
3. Update task statuses as you progress
4. Run verification after each phase
5. Continue through phases in dependency order: 2a → 2b (A4, D1, D2, C1, C2, A5) → 2c (B1-B4, parallel with 2b) → 2d (B5-B8) → 2e (A6)

Good luck.
