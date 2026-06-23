# Agent Consolidation Checkin #1 — Remaining Work Plan

> **Date:** 2026-04-14
> **Scope:** Post-Phase-1 cleanup + route migration + unified chat schema + route modularization + anti-pattern fixes + wrangler reset
> **Status:** Phase 1 (Honi eradication, directory restructuring, method creation) is COMPLETE. This plan covers the remaining work.

---

## Executive Summary

Phase 1 successfully restructured all 10 Omni-Agents into the modular directory pattern and created new method files from absorbed agents. However, the following work remains:

1. **Agent Cleanup (Scope A):** 28 todo_integration files to eventually delete, 4 legacy flat files to remove, 1 missing method file, OverseerAgent dissolution, and 16 stale route references
2. **Unified Chat Schema (Scope B):** Consolidate 3 separate chat systems into a single `db/schemas/chats/` schema with threads, messages, and participants

---

## Scope A: Agent Cleanup

### A1. Legacy Flat Files — Delete Immediately

These duplicate files exist alongside properly structured directories:

| File | Replacement | Action |
|------|------------|--------|
| `ai/agents/ChatRoom.ts` | `ai/agents/ChatRoom/index.ts` | DELETE |
| `ai/agents/WorkshopAgent/CfAgentsSdk.ts` | `CloudflareAgent/methods/agents-sdk-expert.ts` | DELETE |
| `ai/agents/WorkshopAgent/UxResearcher.ts` | `DesignAgent/methods/ux-research.ts` | DELETE |
| `ai/agents/WorkshopAgent/WorkshopAgent.ts` | `WorkshopAgent/index.ts` | DELETE |

**Risk:** Check that no import paths reference these files first. The exports.ts already points to the new locations.

### A2. GithubAgent Missing `methods/repo.ts`

`GithubAgent/todo_integration/Repo.ts` exists but no corresponding `GithubAgent/methods/repo.ts` was created. This is the core repository management logic with DO SQLite state, webhook processing, and file operations.

**Action:** Create `GithubAgent/methods/repo.ts` by extracting the key callable methods from `todo_integration/Repo.ts` and adapting them to the Omni-Agent pattern (receiving agent context as first param).

### A3. OverseerAgent Dissolution

Per the consolidation plan, OverseerAgent's responsibilities have been absorbed:
- Jules oversight → `EngineerAgent/methods/oversee-jules.ts` ✅
- Payload validation → `GuardrailAgent/methods/evaluate.ts` ✅
- Judge → `GuardrailAgent/methods/judge.ts` ✅

**Remaining work:**
1. Verify `EngineerAgent/methods/oversee-jules.ts` includes `checkSchedule()` and `ingestEvent()` methods (from OverseerAgent/index.ts)
2. Move `OVERSEEER_AGENT` (note: typo in wrangler.jsonc) from active bindings to migration-only
3. Keep the OverseerAgent export in exports.ts for wrangler migration tags
4. Remove OverseerAgent from `shared/health.ts` agent monitoring list

### A4. Fix 16 Stale Route References

These routes reference bindings for agents that have been consolidated:

| # | File | Line | Old Binding | New Binding | New Method |
|---|------|------|-------------|-------------|------------|
| 1 | `routes/api/agents/chat.ts` | 55 | `GEMINI_AGENT` | `ORCHESTRATOR` | `.chat()` |
| 2 | `routes/api/agents/deep-research-chat.ts` | 81 | `DEEP_RESEARCH_CHAT_AGENT` | `RESEARCH_AGENT` | `.deepDive()` |
| 3 | `routes/api/frontend/ai/chat.ts` | 177 | `CLOUDFLARE_DOCS_AGENT` | `CLOUDFLARE_AGENT` | `.chat()` |
| 4 | `routes/api/frontend/ai/chat.ts` | 187 | `GEMINI_AGENT` | `ORCHESTRATOR` | `.chat()` |
| 5 | `routes/api/frontend/ai/chat.ts` | 194 | `GEMINI_AGENT` | `ORCHESTRATOR` | `.chat()` |
| 6 | `routes/api/ops/ops.ts` | 93 | `SUPERVISOR` | `ORCHESTRATOR` | `.healthProbe()` |
| 7 | `routes/api/ops/ops.ts` | 100 | `SUPERVISOR` | `ORCHESTRATOR` | `.healthProbe()` |
| 8 | `routes/api/ops/ops.ts` | 107 | `SUPERVISOR` | `ORCHESTRATOR` | `.healthProbe()` |
| 9 | `workflows/research/topic.ts` | 23 | `WEB_SEARCH_AGENT` | `RESEARCH_AGENT` | `.puppeteerSearch()` |
| 10 | `workflows/research/topic.ts` | 39 | `JUDGE_AGENT` | `GUARDRAIL_AGENT` | `.judgeCodeQuality()` |
| 11 | `routes/api/projects/sentinel/mcp.ts` | 207 | `JUDGE_AGENT` | `GUARDRAIL_AGENT` | `.judgeCodeQuality()` |
| 12 | `routes/api/projects/sentinel/submit.ts` | 81-96 | `JUDGE_AGENT` | `GUARDRAIL_AGENT` | `.judgeCodeQuality()` |
| 13 | `routes/api/frontend/research/research.ts` | 25-26 | `TOPIC_ORCHESTRATOR` | `RESEARCH_AGENT` | `.topicResearch()` |
| 14 | `routes/api/projects/sentinel/clarify.ts` | 50 | `JULES_OVERSEER` | `ENGINEER_AGENT` | `.overseeJules()` |

**Note:** Some of these require method signature adaptation. The old agents had different RPC signatures than the new consolidated methods. Each route update must verify the new agent has a matching `@callable()` method or add one.

### A5. wrangler.jsonc & Type Regeneration

1. Verify all old bindings are removed from active DO bindings (already appears done based on exploration)
2. Remove `OVERSEEER_AGENT` typo binding
3. Run `npx wrangler types` to regenerate `worker-configuration.d.ts`
4. Run `tsc --noEmit` to catch any remaining stale references
5. Verify migration tag v6 covers all deleted/renamed classes

### A6. todo_integration/ Cleanup Strategy

The 28 files in `todo_integration/` directories are preserved because `exports.ts` lines 22-43 export them for wrangler DO migration tags. Strategy:

1. **Now:** Leave todo_integration files in place — they're inert but required for deployment
2. **After successful production deploy:** Verify migration tags are applied
3. **Future:** Collapse migration tags (v1-v6 → single v7) and then delete all todo_integration files + legacy exports

---

## Scope B: Unified Chat Schema

### Problem

Three separate chat systems exist with incompatible schemas:
1. `db/schemas/chats/` — modern Drizzle schema (NOT exported for migrations)
2. `db/schemas/agents/chat.ts` — old agent chat (actively used by routes)
3. `db/schemas/agents/mirror.ts` — ChatRoom D1 mirror (`chatRoomLogs`)

### Solution

Extend and activate the modern `db/schemas/chats/` schema as the single source of truth for ALL chat data — user conversations, agent-to-agent orchestration chatter, and ChatRoom messages.

### B1. Extend `threads` Table

**File:** `src/backend/src/db/schemas/chats/threads.ts`

Add columns:
- `hostAgentId` (text, nullable) — which agent hosts this thread (e.g., `ResearchAgent`, `CloudflareAgent`)
- `roomId` (text, nullable) — link to ChatRoom DO instance ID for chatroom-originated threads
- `source` (text enum: `user_chat` | `agent_orchestration` | `chatroom`) — how thread was created
- `userId` (text, nullable) — human user who initiated (null for agent-to-agent)

Add indexes: `threads_host_agent_idx`, `threads_source_idx`, `threads_user_idx`

### B2. Extend `messages` Table

**File:** `src/backend/src/db/schemas/chats/messages.ts`

Add column:
- `metadata` (text, mode: 'json', nullable) — for tool results, ChatRoom context, webhook payloads, evaluation scores

Current schema already has `role` (user|assistant|agent|system|tool) and `author` (agent name or 'user') — these are sufficient.

### B3. Create `thread_participants` Junction Table

**New file:** `src/backend/src/db/schemas/chats/participants.ts`

```
thread_participants:
  threadId (int FK → threads.id, cascade)
  agentName (text)
  role (text enum: host|participant|observer)
  joinedAt (timestamp)
  PK: (threadId, agentName)
  Index: participants_agent_idx on agentName
```

This enables:
- Multiple agents in a single thread
- Tracking which agent is hosting vs participating vs observing
- Querying all threads an agent participates in

### B4. Export Schema & Generate Migration

1. Update `src/backend/src/db/schemas/chats/index.ts` — add `export * from './participants'`
2. Add `export * from './schemas/chats'` to `src/backend/src/db/schema.core.ts`
3. Run `npx drizzle-kit generate` to produce migration SQL
4. Run `pnpm run migrate:local` to test locally

### B5. Migrate Chat Routes

**Primary file:** `src/backend/src/routes/api/frontend/ai/chat.ts`

Changes:
1. Switch imports from `@/db/schemas/agents/chat` → `@db/schemas/chats`
2. Thread creation: `chatThreads` → `threads` (adapt field names: `subject` → `title`, `agentId` → `hostAgentId`, `timestampStarted` → `createdAt`)
3. Message insertion: `chatMessages.message` (text) → `messages.content` (JSON assistant-ui parts format)
4. On thread create, also insert into `threadParticipants` with hosting agent as `host`
5. When a second agent joins the thread (e.g., GuardrailAgent advising), insert as `participant`

### B6. Update ChatRoom D1 Mirroring

**File:** `src/backend/src/ai/agents/ChatRoom/methods/messaging.ts`

Currently `mirrorToD1()` writes to `chatRoomLogs`. Change to:
1. On first message in a room, create a thread (`source: 'chatroom'`, `roomId`)
2. Each message → insert into unified `messages` table (`role: 'agent'`, `author: userName`)
3. Track room → thread mapping in ChatRoom DO SQLite
4. Dual-write to `chatRoomLogs` during transition period (use `ctx.waitUntil()`)

### B7. Agent Chat Integration

Every Omni-Agent's `onChatMessage` handler should:
1. Create/find a thread in D1 with `hostAgentId = agentName`
2. Insert user messages with `role: 'user'`, `author: 'user'`
3. Insert agent responses with `role: 'assistant'`, `author: agentName`
4. When calling another agent via RPC, insert `role: 'agent'`, `author: calledAgentName`
5. Add called agents to `threadParticipants` as `participant`

This captures the full conversation graph including inter-agent collaboration.

### B8. Deprecate Old Chat Schema

After B5-B7 are tested:
1. Remove `export * from './chat'` from `db/schemas/agents/index.ts`
2. Add deprecation comment to `db/schemas/agents/chat.ts`
3. Mark `chatRoomLogs` in `mirror.ts` as deprecated
4. Keep D1 tables for historical data — stop writing to them

---

## Execution Sequence

```
Phase 2a (Immediate, no dependencies):
  A1. Delete legacy flat files
  A2. Create GithubAgent/methods/repo.ts
  A3. Dissolve OverseerAgent from active bindings

Phase 2b (After 2a):
  A4. Fix 16 stale route references
  A5. Regenerate worker-configuration.d.ts, tsc --noEmit

Phase 2c (Parallel with 2b):
  B1. Extend threads table
  B2. Extend messages table
  B3. Create participants table
  B4. Export schema, generate migration

Phase 2d (After 2b + 2c):
  B5. Migrate chat routes
  B6. Update ChatRoom mirroring
  B7. Agent chat integration
  B8. Deprecate old schemas

Phase 2e (After production deploy):
  A6. Collapse migration tags, delete todo_integration/
```

---

## Verification

1. `tsc --noEmit` — zero errors
2. `npx wrangler deploy --dry-run` — validates config + migrations
3. `grep -r "GEMINI_AGENT\|DEEP_RESEARCH_CHAT_AGENT\|SUPERVISOR\|WEB_SEARCH_AGENT\|JUDGE_AGENT\|TOPIC_ORCHESTRATOR\|JULES_OVERSEER\|CLOUDFLARE_DOCS_AGENT" src/backend/src/routes src/backend/src/workflows` — zero matches
4. `pnpm run migrate:local` — migration applies cleanly
5. Every agent directory has: `index.ts`, `health.ts`, `types.ts`, `methods/` (no flat files)
6. No `todo_integration/` referenced by any import outside of `exports.ts` legacy section

---

## Critical Files

| File | Changes |
|------|---------|
| `ai/agents/exports.ts` | Already clean; A6 will remove legacy section later |
| `wrangler.jsonc` | A3: remove OverseerAgent active binding; A5: regenerate types |
| `db/schemas/chats/threads.ts` | B1: add hostAgentId, roomId, source, userId |
| `db/schemas/chats/messages.ts` | B2: add metadata column |
| `db/schemas/chats/participants.ts` | B3: NEW file |
| `db/schemas/chats/index.ts` | B3: add participants export |
| `db/schema.core.ts` | B4: add chats export |
| `routes/api/frontend/ai/chat.ts` | A4 + B5: fix 3 bindings + migrate to new schema |
| `routes/api/agents/chat.ts` | A4: fix 1 binding |
| `routes/api/agents/deep-research-chat.ts` | A4: fix 1 binding |
| `routes/api/ops/ops.ts` | A4: fix 3 bindings |
| `workflows/research/topic.ts` | A4: fix 2 bindings |
| `routes/api/projects/sentinel/mcp.ts` | A4: fix 1 binding |
| `routes/api/projects/sentinel/submit.ts` | A4: fix 1 binding |
| `routes/api/frontend/research/research.ts` | A4: fix 1 binding |
| `routes/api/projects/sentinel/clarify.ts` | A4: fix 1 binding |
| `ai/agents/ChatRoom/methods/messaging.ts` | B6: unified D1 mirroring |
| `ai/agents/GithubAgent/methods/repo.ts` | A2: NEW file |

---

## Scope C: Route Modularization

### Problem

14 loose route files sit directly in `routes/api/` instead of being organized into category subdirectories.

### C1. Move Loose Route Files

| Current Location | Move To | Category |
|------------------|---------|----------|
| `routes/api/actions.ts` | `routes/api/github/actions.ts` | GitHub |
| `routes/api/agent-planning.ts` | `routes/api/agents/planning.ts` | Agents |
| `routes/api/backlog.ts` | `routes/api/projects/backlog.ts` | Projects |
| `routes/api/continuous-learning.ts` | `routes/api/learning/continuous-learning.ts` | Learning |
| `routes/api/health.ts` | `routes/api/ops/health-root.ts` | Ops |
| `routes/api/planning.ts` | `routes/api/projects/planning.ts` | Projects |
| `routes/api/research-orchestration.ts` | `routes/api/research/orchestration.ts` | Research |
| `routes/api/reverse-engineering.ts` | `routes/api/tools/reverse-engineering.ts` | Tools |
| `routes/api/sandbox.ts` | `routes/api/tools/sandbox.ts` | Tools |
| `routes/api/skills.ts` | `routes/api/ai/skills.ts` | AI |
| `routes/api/standardization.ts` | `routes/api/ops/standardization.ts` | Ops |
| `routes/api/stitch.ts` | `routes/api/design/stitch.ts` | Design |

**Keep as-is:** `routes/api/auth.ts` (standard convention), `routes/api/index.ts` (root router)

### C2. Update Root Router

After moving files, update `routes/api/index.ts` to import from the new locations. All route registrations (`app.route(...)`) must be updated.

---

## Scope D: Fix Agent Interaction Anti-Patterns

### Problem

6 route files use the WRONG pattern of `agent.fetch(new Request("http://..."))` to call agent methods. This bypasses the `@callable()` RPC system and hits the legacy `onRequest` fallback handler. Per Cloudflare Agents SDK golden path: "Never construct HTTP requests manually to talk to a Durable Object. Use @callable() RPC methods."

### D1. Anti-Pattern Instances to Fix

| # | File | Line | Anti-Pattern | Fix |
|---|------|------|-------------|-----|
| 1 | `routes/api/ux/index.ts` | 79 | `agent.fetch(new Request("http://agent/stream"))` against DESIGN_AGENT | Add `@callable() stream()` method to DesignAgent, call `agent.stream()` |
| 2 | `routes/api/webhooks/jules.ts` | 96 | `agent.fetch(new Request("http://internal/internal/broadcast"))` against JULES_WEBHOOK_BROADCASTER | Add `@callable() broadcast(payload)` method to JulesWebhookBroadcaster, call `agent.broadcast(payload)` |
| 3 | `routes/api/webhooks/jules.ts` | 191 | `agent.fetch(new Request("http://jules-overseer/schedule/check"))` against JULES_OVERSEER | Replace with ENGINEER_AGENT `agent.checkSchedule()` (already exists in oversee-jules.ts) |
| 4 | `routes/api/ops/health.ts` | 69 | `agent.fetch(new Request("http://agent/diagnose"))` against LEARNING_AGENT | Add `@callable() diagnose(errorInfo)` method to LearningAgent, call `agent.diagnose(errorInfo)` |
| 5 | `routes/api/projects/sentinel/broadcast.ts` | 24 | `agent.fetch(new Request("http://internal/internal/broadcast"))` against JULES_WEBHOOK_BROADCASTER | Same fix as #2: `agent.broadcast(payload)` |
| 6 | `routes/api/projects/sentinel/clarify.ts` | 32 | `agent.fetch(new Request("http://internal/internal/broadcast"))` against JULES_WEBHOOK_BROADCASTER | Same fix as #2: `agent.broadcast(payload)` |
| 7 | `routes/api/projects/sentinel/submit.ts` | 84-85 | `c.env.JUDGE_AGENT.fetch(new Request('http://judge/task'))` against JUDGE_AGENT | Replace with GUARDRAIL_AGENT `agent.judgeCodeQuality(...)` |

### D2. Add Missing @callable Methods

| Agent | Method to Add | Purpose |
|-------|---------------|---------|
| JulesWebhookBroadcaster (`do/JulesWebhookBroadcaster.ts`) | `@callable() broadcast(payload)` | WebSocket fan-out of events to connected clients |
| DesignAgent | `@callable() stream(runId)` | SSE stream for design pipeline progress (or return a readable stream) |
| LearningAgent | `@callable() diagnose(errorInfo)` | AI-powered health failure analysis |

**Note:** For SSE streaming (DesignAgent), `@callable()` may not support streaming responses. In that case, keep the `onRequest` handler for the `/stream` endpoint but document it as an intentional exception with a comment explaining why RPC can't be used. The Cloudflare Agents SDK `onRequest` is the correct pattern for streaming — what's wrong is constructing `new Request("http://agent/...")` from the route. Instead, the route should use `routeAgentRequest()` or handle streaming via WebSocket (which the Agents SDK natively supports).

---

## Scope E: wrangler.jsonc Fresh Migration Reset

### Problem

The current wrangler.jsonc has 6 migration tags (v1 through v6) with a tangled history of creates, renames, and deletes. Since we're treating this as a brand new worker deployment, we should consolidate to a single clean `v1` migration with `new_sqlite_classes` listing ONLY the classes that currently exist.

### E1. Current vs Required DO Classes

**Active DO bindings (from wrangler.jsonc lines 234-301):**
| Binding | Class | Source | Needs SQLite |
|---------|-------|--------|-------------|
| ORCHESTRATOR | OrchestratorAgent | `ai/agents/exports.ts` | YES |
| ENGINEER_AGENT | SoftwareEngineerAgent | `ai/agents/exports.ts` (aliased from EngineerAgent) | YES |
| GUARDRAIL_AGENT | GuardrailAgent | `ai/agents/exports.ts` | YES |
| RESEARCH_AGENT | ResearchAgent | `ai/agents/exports.ts` | YES |
| GITHUB_AGENT | GithubAgent | `ai/agents/exports.ts` | YES |
| CLOUDFLARE_AGENT | CloudflareAgent | `ai/agents/exports.ts` | YES |
| DESIGN_AGENT | DesignAgent | `ai/agents/exports.ts` (aliased from StitchDesignAgent) | YES |
| LEARNING_AGENT | ContinuousLearningAgent | `ai/agents/exports.ts` | YES |
| WORKSHOP_AGENT | WorkshopAgent | `ai/agents/exports.ts` | YES |
| CHAT_ROOM | ChatRoom | `ai/agents/exports.ts` | YES |
| SANDBOX | Sandbox | `@cloudflare/sandbox` | YES |
| JULES_WEBHOOK_BROADCASTER | JulesWebhookBroadcaster | `do/JulesWebhookBroadcaster.ts` | YES |
| PLANNING_MONITOR | PlanningMonitor | `do/PlanningMonitor.ts` | YES |
| REVERSE_ENGINEERING_MONITOR | ReverseEngineeringMonitor | `do/ReverseEngineeringMonitor.ts` | YES |
| AGENT_SESSION_DO | AgentSessionDO | `do/AgentSessionDO.ts` | YES |
| ROOM_DO | RoomDO | `do/RoomDO.ts` | YES |

**Workflow classes (from wrangler.jsonc lines 476-539):**
| Class | Exported From |
|-------|--------------|
| GithubSearchWorkflow | `workflows/exports.ts` |
| DeepResearchWorkflow | `workflows/exports.ts` |
| ResearchOrchestrator | `workflows/exports.ts` |
| TopicResearchWorkflow | `workflows/exports.ts` |
| DiscordResearchWorkflow | `workflows/exports.ts` |
| PlanningOrchestrator | `workflows/exports.ts` |
| CloudflareChangelogWorkflow | `workflows/exports.ts` |
| StitchLoopWorkflow | `workflows/exports.ts` |
| JulesResearchWorkflow | `ai/agents/exports.ts` |
| ContinuousLearningWorkflow | `ai/agents/exports.ts` |
| LearningWorkflow | **NOT in workflows/exports.ts** — must add |
| HitlWorkflow | `workflows/exports.ts` — **NOT in wrangler.jsonc** — must add if used |

### E2. Export Alignment Issues

1. `LearningWorkflow` is in wrangler.jsonc but NOT exported from `workflows/exports.ts` — **must add export**
2. `HitlWorkflow` is exported from `workflows/exports.ts` but NOT in wrangler.jsonc — **decide: add binding or remove export**
3. `SoftwareEngineerAgent` — exports.ts aliases `EngineerAgent as SoftwareEngineerAgent`, wrangler uses `SoftwareEngineerAgent` as class_name. This must match.
4. `DesignAgent` — exports.ts aliases `StitchDesignAgent as DesignAgent`, wrangler uses `DesignAgent` as class_name. This must match.

### E3. Fresh v1 Migration

Replace ALL 6 migration tags with a single clean `v1`:

```jsonc
"migrations": [
  {
    "tag": "v1",
    "new_sqlite_classes": [
      // Core Omni-Agents (10)
      "OrchestratorAgent",
      "SoftwareEngineerAgent",
      "GuardrailAgent",
      "ResearchAgent",
      "GithubAgent",
      "CloudflareAgent",
      "DesignAgent",
      "ContinuousLearningAgent",
      "WorkshopAgent",
      "ChatRoom",
      // Infrastructure DOs (6)
      "Sandbox",
      "JulesWebhookBroadcaster",
      "PlanningMonitor",
      "ReverseEngineeringMonitor",
      "AgentSessionDO",
      "RoomDO"
    ]
  }
]
```

### E4. Clean Up Legacy Exports

Once we reset to v1 with only current classes, the "Legacy class exports (MIGRATION ONLY)" section in `ai/agents/exports.ts` (lines 22-43) is **no longer needed**. Those exports existed only for the migration tags that reference deleted/renamed classes. With a fresh v1, they can all be removed.

This also means the `todo_integration/` directories can be deleted immediately (they were only kept for those legacy exports).

### E5. Verify Export-to-Wrangler Alignment

After the reset, every `class_name` in wrangler.jsonc `durable_objects.bindings` and `workflows` MUST have a matching named export from `src/backend/src/exports.ts`. Run a verification:

1. Extract all `class_name` values from wrangler.jsonc
2. For each, verify `grep -r "export.*class_name\|export.*as class_name" src/backend/src/exports.ts src/backend/src/ai/agents/exports.ts src/backend/src/workflows/exports.ts`
3. Any mismatch = deployment will fail

---

## Updated Execution Sequence

```
Phase 2a (Immediate, no dependencies):
  A1. Delete legacy flat files
  A2. Create GithubAgent/methods/repo.ts
  A3. Dissolve OverseerAgent from active bindings
  E1. Reset wrangler.jsonc migrations to single v1
  E2. Fix export alignment (LearningWorkflow, etc.)
  E3. Delete legacy exports + todo_integration/ dirs

Phase 2b (After 2a):
  A4. Fix 16 stale route references
  D1. Fix 7 anti-pattern .fetch() calls
  D2. Add missing @callable methods
  A5. Regenerate worker-configuration.d.ts, tsc --noEmit
  C1. Move 12 loose route files to categories
  C2. Update root router

Phase 2c (Parallel with 2b):
  B1-B4. Unified chat schema (extend tables, create participants, export, migrate)

Phase 2d (After 2b + 2c):
  B5-B8. Chat route migration, ChatRoom mirroring, agent integration, deprecation
```
