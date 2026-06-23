# Implementation Plan — Software Orchestration UI v3 (Revised v3)



> **Plan-mode note**: Plan mode is active, so this is being authored at the assigned plan file. After approval (via `ExitPlanMode`), the implementation phase should also copy this content into `docs/20260407/software_orchestration_ui/v3/plan_v2.md` (the original location requested in the user's first message) so the docs tree stays in sync.



---



## Context



The `SoftwareEngineerAgent` is currently a thin Jules session launcher with mirrored state in D1 but no internal brain, no fleet supervision, no Stitch collaboration, and no live progress UI. Over the same period, the `src/backend/src/ai/agents/` directory has fragmented into ~40+ overlapping agents (multiple Orchestrators, multiple Researchers, dead `honi` imports, duplicated planning/supervisor classes). The user wants three coordinated changes landed in one plan:



1. **Modularization**: Collapse `src/backend/src/ai/agents/` into 4 MMoE (Mixture-of-Modular-Experts) agents — `OrchestratorAgent`, `EngineerAgent`, `GuardrailAgent`, `ResearchAgent` — each with a strict folder layout (`index.ts` + `types.ts` + `health.ts` + `methods/*.ts`).

2. **Generic ChatRoom**: Finish the partially-completed `PlanningRoom` → `ChatRoom` rename. ChatRoom becomes the universal collaboration substrate; every agent session can have one, and the Orchestrator subscribes to all of them so it can react to Jules questions, guardrail violations, plan-ready events, etc.

3. **Drizzle-managed agent state + transparency UI**: Replace raw `this.sql` strings with a proper Drizzle schema at `src/backend/src/db/schemas/agents/software/stateful.ts`, mirror to D1 for eviction recovery, expose milestone progress over WebSocket, and surface a hierarchy diagram in a new frontend status view.



The end state is a transparent, modular orchestration layer where the Orchestrator delegates one task to the Engineer, the Engineer internally fleet-orchestrates Jules + Stitch sessions inside a shared ChatRoom, the Guardrail intercepts payloads against Edigraph "golden paths", and the user watches the entire hierarchy update live in the frontend.



### Inputs already available (verified via exploration)



| What | Where | Notes |

|------|-------|------|

| `ChatRoom` DO class | `src/backend/src/ai/agents/ChatRoom.ts` | Already extends `AIChatAgent<Env>`, has `ping`/`onConnect`/`onMessage`/`onClose`/`mirrorToD1` |

| `CHAT_ROOM` wrangler binding | `wrangler.jsonc` | Already pointing to `ChatRoom` class |

| `EdigraphService` (episodic/semantic/graph memory) | `src/backend/src/ai/agents/support/edigraph-memory.ts` | Full RPC client over `env.EDGRAPH` Service Binding |

| `DiscordResearchAgent` + workflow | `src/backend/src/ai/agents/research/DiscordResearch.ts`, `src/backend/src/workflows/research/discord.ts` | Tools: `search_discord_messages`, `run_discord_research` |

| `CloudflareChangelogWorkflow` | `src/backend/src/workflows/research/cloudflare-changelog.ts` | RSS fetch → dedupe → AI summarize → persist |

| `JulesService` singleton | `src/backend/src/services/jules/service.ts` | 23+ public methods incl. `startSession`, `startParallelSessions`, `approveSession`, `sendMessage`, `getCodeReviewContext`, `collectSessionOutcome` |

| Stitch MCP tools | `src/backend/src/ai/mcp/tools/cloudflare/stitch.ts` | `stitch_create_project`, `stitch_generate_screen`, `stitch_edit_screen`, etc. |

| Standards tool (broken `honi` import) | `src/backend/src/ai/mcp/tools/standards.ts` | Needs `import { tool } from "ai"` fix |

| `setupOpenAIAgentClient()` + `runWithOpenAIAgent()` | `src/backend/src/ai/providers/clients/openai/agent.ts`, `src/backend/src/ai/providers/methods/orchestration.ts` | Brain integration entry points |

| `buildCodingAgentInstructions()` | `src/backend/src/services/golden-path-config.ts` | Builds golden-path system prompt |

| `JulesWebhookBroadcaster` DO | `src/backend/src/do/JulesWebhookBroadcaster.ts` | Existing WS fan-out (singleton named `jules-broadcaster`) |

| `BroadcastClient` helper | `src/backend/src/utils/do-broadcast.ts` | `broadcast()` and `upgradeWebSocket()` proxies |

| `agentStateMirror` D1 table | `src/backend/src/db/schemas/agents/mirror.ts` | Already used by SWE agent for state snapshots |

| Drizzle DO-SQLite pattern | `src/backend/src/db/schemas/agents/stateful.ts` | Reference pattern for new `software/stateful.ts` |

| `julesSessions` D1 schema | `src/backend/src/db/schemas/jules/sessions.ts` | Has `agentId`, `sessionRole`, `planningRequestId` columns |

| Cloudflare Agents SDK `this.sql` | Verified in CF docs | Tagged-template API on `Agent` base — `` this.sql`SELECT *...` `` |



### Cloudflare Agents SDK confirmations (from Cloudflare docs MCP)



- Each `Agent`/`AIChatAgent` instance has its own embedded SQLite database (10 GB per DO, GA April 2025).

- The native API is the tagged-template `this.sql` (idiomatic) — but `drizzle-orm/durable-sqlite` is fully supported via `drizzle(this.ctx.storage, { schema })`, which is the pattern the user wants.

- `this.broadcast(data)` is a built-in method on `AIChatAgent` that fans out to all connected WebSocket clients.

- Agents-to-Agents RPC works via `getAgentByName(env.BINDING, name)` then direct method invocation.

- Agents SDK v0.6.0 (Feb 2026) added in-Worker DO RPC transport for MCP — no HTTP overhead.

- Workflows are the right tool for >30s background work; Agents handle real-time communication.



---



## Agent Refactor Inventory



### Files to delete (legacy / redundant)



After consolidation, these files should be removed (verify no remaining importers first):



| File | Replaced by |

|------|-------------|

| `src/backend/src/ai/agents/Planner.ts` | `OrchestratorAgent/methods/plan.ts` |

| `src/backend/src/ai/agents/Supervisor.ts` | `OrchestratorAgent/methods/supervise.ts` |

| `src/backend/src/ai/agents/TopicOrchestrator.ts` | `OrchestratorAgent/methods/dispatch.ts` |

| `src/backend/src/ai/agents/master/OrchestratorAgent.ts` | New `OrchestratorAgent/index.ts` |

| `src/backend/src/ai/agents/master/OverseerAgent.ts` | `OrchestratorAgent/methods/overseer.ts` |

| `src/backend/src/ai/agents/planning/Orchestrator.ts` | `OrchestratorAgent/methods/dispatch.ts` |

| `src/backend/src/ai/agents/planning/Supervisor.ts` | `OrchestratorAgent/methods/supervise.ts` |

| `src/backend/src/ai/agents/orchestration/base-orchestrator.ts` | `OrchestratorAgent/methods/base.ts` |

| `src/backend/src/ai/agents/orchestration/task-orchestrator.ts` | `EngineerAgent/methods/task.ts` |

| `src/backend/src/ai/agents/implementers/SoftwareEngineerAgent.ts` | `EngineerAgent/index.ts` |

| `src/backend/src/ai/agents/implementers/ResearchAgent.ts` | `ResearchAgent/index.ts` |

| `src/backend/src/ai/agents/StitchDesignAgent.ts` | `EngineerAgent/methods/stitch-orchestrator.ts` |

| `src/backend/src/ai/agents/SandboxAgent.ts` | `EngineerAgent/methods/sandbox.ts` |

| `src/backend/src/ai/agents/LandingPageAgent.ts` | `EngineerAgent/methods/landing-page.ts` |

| `src/backend/src/ai/agents/Judge.ts` | `GuardrailAgent/methods/judge.ts` |

| `src/backend/src/ai/agents/HealthDiagnostician.ts` | `GuardrailAgent/methods/diagnose.ts` |

| `src/backend/src/ai/agents/StandardizationAgent.ts` | `GuardrailAgent/methods/standards.ts` |

| `src/backend/src/ai/agents/Research.ts` (already deleted) | `ResearchAgent/index.ts` |

| `src/backend/src/ai/agents/WebSearch.ts` | `ResearchAgent/methods/web-search.ts` |

| `src/backend/src/ai/agents/DeepResearchChat.ts` | `ResearchAgent/methods/deep-research.ts` |

| `src/backend/src/ai/agents/research/DiscordResearch.ts` | `ResearchAgent/methods/discord.ts` (wraps existing workflow) |

| `src/backend/src/ai/agents/CloudflareDocs.ts` | `ResearchAgent/methods/cloudflare-docs.ts` |



### Files to keep as-is (already correct shape)



- `src/backend/src/ai/agents/ChatRoom.ts` — already `AIChatAgent`, no duplication

- `src/backend/src/ai/agents/support/edigraph-memory.ts` — used by GuardrailAgent

- `src/backend/src/ai/agents/support/agent-utils.ts`, `support/structured-chat.ts` — utility helpers

- `src/backend/src/ai/agents/github/RepoAgent.ts`, `github/PrReviewer.ts` — specialized AIChatAgent subclasses tied to specific GitHub flows; out of scope for this consolidation

- `src/backend/src/ai/agents/workshop/UxResearcher.ts` — workshop-specific, separate concern

- `src/backend/src/ai/agents/patterns/*` — these are reusable orchestration patterns, not agent classes



### Migration is **additive-then-destructive**



Phase A creates the new agents alongside the old. Phase B switches every importer (routes, health checks, frontend WS routes) to the new bindings. Phase C deletes the legacy files only after `pnpm run check` is green.



---



## Step 1 — Fix Broken `honi` Import



**File**: `src/backend/src/ai/mcp/tools/standards.ts`



```diff

-import { tool } from "@/ai/agents/honi";

+import { tool } from "ai";

```



This must land first or the entire backend stops compiling.



---



## Step 2 — Drizzle Schema for EngineerAgent State



**New file**: `src/backend/src/db/schemas/agents/software/stateful.ts`



Pattern source: `src/backend/src/db/schemas/agents/stateful.ts` (uses `drizzle-orm/durable-sqlite`).



```typescript

/**

 * @file src/db/schemas/agents/software/stateful.ts

 * @description Drizzle ORM schema for EngineerAgent's embedded DO SQLite database.

 * Tracks fleet sessions and milestone state inside the Engineer DO. Mirrored to

 * D1 (agentStateMirror, chatRoomLogs, julesSessions) for eviction recovery.

 */



import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

import { sql } from "drizzle-orm";



// ─── Tables ─────────────────────────────────────────────────────────────────



export const sweFleetSessions = sqliteTable(

  "swe_fleet_sessions",

  {

    id: text("id").primaryKey(),                       // Jules session ID

    requestId: text("request_id").notNull(),

    role: text("role", { enum: ["solo", "fleet-member", "stitch", "merge"] }).notNull(),

    status: text("status", {

      enum: ["active", "completed", "failed", "stuck", "waiting_for_user"],

    }).notNull().default("active"),

    promptHash: text("prompt_hash"),

    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),

    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),

  },

  (t) => ({

    requestIdx: index("idx_swe_fleet_request").on(t.requestId),

    statusIdx: index("idx_swe_fleet_status").on(t.status),

  }),

);



export const sweMilestones = sqliteTable(

  "swe_milestones",

  {

    id: text("id").primaryKey(),

    requestId: text("request_id").notNull(),

    sessionId: text("session_id"),                    // null for planning-only milestones

    name: text("name").notNull(),                     // 'brain:evaluate', 'jules:session-1', etc.

    status: text("status", {

      enum: ["staged", "in_progress", "pending_review", "blocked", "complete", "failed"],

    }).notNull().default("staged"),

    detail: text("detail"),

    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),

  },

  (t) => ({

    requestIdx: index("idx_swe_milestone_request").on(t.requestId),

  }),

);



// ─── DO SQLite wiring ───────────────────────────────────────────────────────



export const engineerSchema = { sweFleetSessions, sweMilestones };

export type EngineerDb = DrizzleSqliteDODatabase<typeof engineerSchema>;



export function getEngineerDb(storage: DurableObjectStorage): EngineerDb {

  return drizzle(storage, { schema: engineerSchema }) as EngineerDb;

}



/**

 * Apply idempotent DDL inside the DO. Call from `ctx.blockConcurrencyWhile()`

 * in `onStart()` to guarantee the schema exists before any incoming RPC.

 */

export function migrateEngineerDb(storage: DurableObjectStorage): void {

  storage.sql.exec(`

    CREATE TABLE IF NOT EXISTS swe_fleet_sessions (

      id TEXT PRIMARY KEY,

      request_id TEXT NOT NULL,

      role TEXT NOT NULL CHECK (role IN ('solo','fleet-member','stitch','merge')),

      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','stuck','waiting_for_user')),

      prompt_hash TEXT,

      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))

    );

    CREATE INDEX IF NOT EXISTS idx_swe_fleet_request ON swe_fleet_sessions (request_id);

    CREATE INDEX IF NOT EXISTS idx_swe_fleet_status ON swe_fleet_sessions (status);



    CREATE TABLE IF NOT EXISTS swe_milestones (

      id TEXT PRIMARY KEY,

      request_id TEXT NOT NULL,

      session_id TEXT,

      name TEXT NOT NULL,

      status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','in_progress','pending_review','blocked','complete','failed')),

      detail TEXT,

      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))

    );

    CREATE INDEX IF NOT EXISTS idx_swe_milestone_request ON swe_milestones (request_id);

  `);

}

```



**Usage inside `EngineerAgent`**:



```typescript

async onStart() {

  await this.ctx.blockConcurrencyWhile(async () => {

    migrateEngineerDb(this.ctx.storage);

  });

  this.db = getEngineerDb(this.ctx.storage);

  this.ai = new AIProvider(this.env);

  this.memory = new EdigraphService(this.env.EDGRAPH, this.id.toString());



  // Eviction recovery: rehydrate fleet from D1 julesSessions if local table is empty

  const local = await this.db.select().from(sweFleetSessions).limit(1);

  if (local.length === 0) {

    const d1 = getDb(this.env.DB);

    const remote = await d1

      .select()

      .from(julesSessions)

      .where(and(eq(julesSessions.agentId, this.id.toString()), eq(julesSessions.status, "active")));

    if (remote.length > 0) {

      await this.db.insert(sweFleetSessions).values(

        remote.map((s) => ({

          id: s.id,

          requestId: s.planningRequestId ?? "",

          role: (s.sessionRole as any) ?? "fleet-member",

          status: s.status,

        })),

      ).onConflictDoNothing();

    }

  }

}

```



---



## Step 3 — Finish ChatRoom Rename (Generic Collaboration Substrate)



The class and wrangler binding are already migrated. The remaining work is the D1 schema, frontend, and documentation.



### 3a. Rename D1 table + Drizzle export



**File**: `src/backend/src/db/schemas/agents/mirror.ts`



```diff

-export const planningRoomLogs = sqliteTable(

-  "planning_room_logs",

+export const chatRoomLogs = sqliteTable(

+  "chat_room_logs",

   {

     id: text("id").primaryKey(),

     roomId: text("room_id").notNull(),

     ...

```



Update the JSDoc comment from "PlanningRoom interactions" to "ChatRoom interactions (any agent collaboration session)".



### 3b. Generate Drizzle migration



```bash

pnpm drizzle-kit generate

```



This produces `migrations/core/NNNN_chat_room_logs_rename.sql` with `ALTER TABLE planning_room_logs RENAME TO chat_room_logs`.



### 3c. Update all importers



Grep for `planningRoomLogs` and `planning_room_logs` and replace with `chatRoomLogs` / `chat_room_logs`. Verified affected files:



- `src/backend/src/ai/agents/ChatRoom.ts` (line 5, 90)

- `src/backend/src/db/schemas/agents/mirror.ts`

- `src/backend/src/db/schemas/agents/index.ts` (barrel re-export)

- Any new EngineerAgent code authored in this plan

- `src/frontend/src/components/docs/SoftwareOrchestrationDoc.tsx` (lines 75, 80–86 — doc references)



### 3d. Frontend component renames



| Old | New | Notes |

|----|-----|------|

| `src/frontend/src/components/PlanningCenter.tsx` (inner `PlanningRoom`) | `ChatRoomPanel` | Local component name only |

| `src/frontend/src/views/repos/EmbeddedPlanningRoom.tsx` | `EmbeddedChatRoom.tsx` | Update imports in `ProjectsBeta.tsx` |

| `src/frontend/src/views/control/global/ChatRoomsList.tsx` | (already named) | Update query key `'active-planning-rooms'` → `'active-chat-rooms'` and route `/api/agent-planning/rooms/active` → `/api/chat-rooms/active` |

| `src/frontend/src/components/docs/AgentDocLayout.tsx` | (link only) | `/control/global/planning-rooms` → `/control/global/chat-rooms` |



### 3e. Backend route rename



- `src/backend/src/routes/api/agent-planning.ts` → keep router but expose `/chat-rooms/active` alongside the legacy alias for one release cycle, then remove.



### 3f. Documentation



- `src/frontend/src/components/docs/SoftwareOrchestrationDoc.tsx` — update prose to call ChatRoom a "generic agent collaboration room" rather than "PlanningRoom".



### 3g. Generic ChatRoom semantics — orchestrator subscription pattern



ChatRoom is no longer specific to planning. Every agent session can have a ChatRoom (`roomId = sessionId | requestId | epicId`). The `OrchestratorAgent` subscribes to relevant rooms by opening a server-side WebSocket inside its `onStart()` (using `getAgentByName(env.CHAT_ROOM, roomId)` and then connecting via the `chat-room.connect` RPC) so it can react to:



- Jules `waiting_for_user` questions (auto-answer or escalate)

- Guardrail rejections (re-prompt or halt)

- Plan-ready events (auto-approve or flag)

- StitchBuildLoop iteration events

- Fleet merge proposals



This subscription model is new behavior introduced in **Step 5** (OrchestratorAgent detail), but the rename is what makes it semantically coherent.



---



## Step 4 — Folder Layout Standard for the 4 MMoE Agents



Every consolidated agent uses this exact structure:



```

src/backend/src/ai/agents/{AgentName}/

├── index.ts                  # The AIChatAgent<Env> class — thin shell, RPC entry points

├── types.ts                  # State, Event, RPC payload types

├── health.ts                 # checkXxxHealth() function for coordinator.ts

└── methods/

    ├── {method-1}.ts         # One file per non-trivial operation

    ├── {method-2}.ts

    └── ...

```



**Index.ts pattern** — keep the class minimal, delegate to methods:



```typescript

import { AIChatAgent } from "@cloudflare/ai-chat";

import { callable } from "agents";

import { AIProvider } from "@/ai/providers";

import * as methods from "./methods";

import type { EngineerState } from "./types";



export class EngineerAgent extends AIChatAgent<Env, EngineerState> {

  private ai!: AIProvider;

  // ... shared resources



  async onStart() { /* init resources, migrate DO db */ }



  @callable()

  async assignSprint(sprint: SprintData) {

    return methods.assignSprint(this, sprint);

  }



  @callable()

  async onJulesStatusChange(sessionId: string, status: string, payload: any) {

    return methods.handleJulesEvent(this, sessionId, status, payload);

  }

}

```



Each method file exports a single function that takes the agent instance as its first arg. This pattern keeps `index.ts` scannable and avoids monolithic class files.



---



## Step 5 — `OrchestratorAgent` (PM)



**Folder**: `src/backend/src/ai/agents/OrchestratorAgent/`



**Wrangler binding**: `ORCHESTRATOR_AGENT` (already exists; will point to new class).



**Base class**: `AIChatAgent<Env, OrchestratorState>` — owns the WS connection with `assistant-ui`.



**Files**:



| File | Responsibility |

|------|----------------|

| `index.ts` | AIChatAgent shell, RPC surface, delegates to methods |

| `types.ts` | `Sprint`, `Epic`, `UserStory`, `Task` (SWARM schema), `OrchestratorState` |

| `health.ts` | `checkOrchestratorHealth(env)` returns `HealthStepResult` |

| `methods/parse-request.ts` | Convert user prompt → SWARM Task tree (uses `AIProvider.generateStructuredResponse`) |

| `methods/dispatch.ts` | `assignSprintToEngineer()` via RPC: `await getAgentByName(env.ENGINEER_AGENT, this.id).assignSprint(sprint)` |

| `methods/subscribe-rooms.ts` | Open server-side WS to relevant ChatRooms; inject auto-responses for Jules questions, Guardrail rejections |

| `methods/onMessage.ts` | Handle `assistant-ui` Vercel AI SDK Data Stream protocol messages |



**RPC surface** (callable from frontend or other agents):



| Method | Purpose |

|--------|---------|

| `submitRequest(prompt, repoContext)` | Top-level user entry — kicks off SWARM breakdown + dispatch |

| `onTaskComplete(requestId, result)` | Engineer reports completion |

| `getStatus(requestId)` | Snapshot of all milestones for a request |



**Key collaboration rule**: The Orchestrator NEVER touches Jules or Stitch APIs directly. It only assigns Sprints. The Engineer hides all implementation details.



---



## Step 6 — `EngineerAgent` (Tech Lead) — Most of the v2 Detail Lives Here



**Folder**: `src/backend/src/ai/agents/EngineerAgent/`



**Wrangler binding**: `ENGINEER_AGENT` (new) replaces `SOFTWARE_ENGINEER_AGENT`. Add an alias migration so existing code keeps working until callers are updated.



**Base class**: `AIChatAgent<Env, EngineerState>`.



**Files**:



| File | Responsibility |

|------|----------------|

| `index.ts` | AIChatAgent shell, `onStart` migration, RPC entry points |

| `types.ts` | `Sprint`, `Subtask`, `MilestoneEvent`, `MilestoneStatus`, `EngineerState` |

| `health.ts` | `checkEngineerHealth(env)` |

| `methods/brain.ts` | Init OpenAI Agents SDK brain via `setupOpenAIAgentClient("worker-ai")`; `evaluateTask()` decides solo vs fleet vs triangle |

| `methods/enrich.ts` | `rewriteQuestionForMCP()` + Cloudflare Docs MCP call + `buildCodingAgentInstructions()` + `makeQueryStandardsTool()` |

| `methods/jules-orchestrator.ts` | `runFleet()`, `enrichAndStartSession()`, `handlePlanReady()`, `handleQuestion()`, `handleSessionComplete()`, `checkAndMergeFleet()` |

| `methods/stitch-orchestrator.ts` | `runStitchBuildLoop()` — manages `.stitch/SITE.md`, `.stitch/DESIGN.md`, `.stitch/next-prompt.md` baton, calls `stitch_*` MCP tools |

| `methods/triangle.ts` | `notifyStitch()`, `awaitStitchCompletion()` — coordinates with EngineerAgent's own stitch-orchestrator OR signals Stitch via shared ChatRoom |

| `methods/milestones.ts` | `emitMilestone()` — three-way write (DO Drizzle → D1 mirror → WS broadcast) |

| `methods/guardrail-bridge.ts` | Calls `await getAgentByName(env.GUARDRAIL_AGENT, this.id).evaluatePayload(...)` before approving Jules PRs or Stitch screens |



### EngineerAgent state shape (`types.ts`)



```typescript

export type MilestoneStatus =

  | "staged" | "in_progress" | "pending_review"

  | "blocked" | "complete" | "failed";



export interface MilestoneEvent {

  id: string;

  requestId: string;

  sessionId?: string;

  name: string;             // 'brain:evaluate' | 'jules:session-1' | 'stitch:loop-3' | 'fleet:merge'

  status: MilestoneStatus;

  detail?: string;

  timestamp: number;

}



export interface EngineerState {

  activeRequests: string[];

  lastMilestone?: MilestoneEvent;

}

```



### `emitMilestone()` (the heart of the transparency story)



```typescript

// methods/milestones.ts

export async function emitMilestone(

  agent: EngineerAgent,

  requestId: string,

  name: string,

  status: MilestoneStatus,

  detail?: string,

  sessionId?: string,

) {

  const id = crypto.randomUUID();



  // 1. Drizzle write to DO embedded SQLite (hot path)

  await agent.db

    .insert(sweMilestones)

    .values({ id, requestId, sessionId, name, status, detail })

    .onConflictDoUpdate({

      target: sweMilestones.id,

      set: { status, detail, updatedAt: new Date() },

    });



  // 2. Mirror to D1 chatRoomLogs (cross-DO visibility, eviction recovery)

  const d1 = getDb(agent.env.DB);

  agent.ctx.waitUntil(

    d1.insert(chatRoomLogs).values({

      id,

      roomId: requestId,

      messageType: "milestone",

      content: name,

      metadataJson: JSON.stringify({ status, sessionId, detail }),

    }),

  );



  // 3. Broadcast to all WS clients via the shared ChatRoom for this request

  agent.ctx.waitUntil((async () => {

    const room = await getAgentByName(agent.env.CHAT_ROOM, requestId);

    await (room as any).onMessage(

      { id: "engineer", state: { username: "EngineerAgent" } } as any,

      JSON.stringify({

        text: `${name} → ${status}`,

        metadata: { type: "milestone_update", milestone: { id, name, status, sessionId, detail, timestamp: Date.now() } },

      }),

    );

  })());



  // 4. Update Agents SDK in-memory state for `setState`/`useAgent` clients

  agent.setState({ ...agent.state, lastMilestone: { id, requestId, sessionId, name, status, detail, timestamp: Date.now() } });

}

```



The fan-out to ChatRoom is the key insight: the ChatRoom is already a WebSocket DO with a tail-able event stream, so the frontend just connects to `CHAT_ROOM/{requestId}` and gets every milestone for free — no new WebSocket route needed.



### Fleet encapsulation (Architecture B confirmed)



```typescript

// methods/jules-orchestrator.ts

export async function runFleet(agent: EngineerAgent, sprint: Sprint) {

  await emitMilestone(agent, sprint.requestId, "brain:plan-split", "in_progress");

  const subtasks = await brain.splitTask(agent, sprint);

  await emitMilestone(agent, sprint.requestId, "brain:plan-split", "complete", `${subtasks.length} subtasks`);



  const jules = JulesService.getInstance(agent.env);

  const sessions = await jules.startParallelSessions(

    subtasks.map((t) => ({

      ...t.params,

      planningRequestId: sprint.requestId,

      sessionRole: "fleet-member",

      agentId: agent.id.toString(),

    })),

  );



  await agent.db.insert(sweFleetSessions).values(

    sessions.map((s) => ({ id: s.id, requestId: sprint.requestId, role: "fleet-member" as const, status: "active" as const })),

  );



  // Webhook → onJulesStatusChange → checkAndMergeFleet when all complete

}



export async function checkAndMergeFleet(agent: EngineerAgent, requestId: string) {

  const pending = await agent.db

    .select()

    .from(sweFleetSessions)

    .where(and(

      eq(sweFleetSessions.requestId, requestId),

      eq(sweFleetSessions.role, "fleet-member"),

      ne(sweFleetSessions.status, "completed"),

    ));

  if (pending.length > 0) return;



  await emitMilestone(agent, requestId, "fleet:merge", "in_progress");

  const jules = JulesService.getInstance(agent.env);

  // Use Jules merge_reconciliation MCP tool

  const merged = await jules.executeMCPTool("merge_reconciliation", { requestId, sessionIds: /* ... */ });

  await emitMilestone(agent, requestId, "fleet:merge", "complete", merged.prUrl);



  // Report completion to Orchestrator — single PR

  const orchestrator = await getAgentByName(agent.env.ORCHESTRATOR_AGENT, "global");

  await (orchestrator as any).onTaskComplete(requestId, merged);

}

```



### Stitch Build Loop (autonomous frontend generation)



```typescript

// methods/stitch-orchestrator.ts

export async function runStitchBuildLoop(agent: EngineerAgent, requestId: string, designSpec: DesignSpec) {

  await emitMilestone(agent, requestId, "stitch:init", "in_progress");



  // Initialize Stitch project + .stitch/SITE.md + .stitch/DESIGN.md

  const project = await stitchTools.createProject({ title: designSpec.title });

  await emitMilestone(agent, requestId, "stitch:init", "complete", project.id);



  let nextPrompt = designSpec.initialPrompt;

  let iteration = 0;

  const MAX_ITERATIONS = 10;



  while (iteration < MAX_ITERATIONS) {

    iteration++;

    await emitMilestone(agent, requestId, `stitch:loop-${iteration}`, "in_progress", nextPrompt.slice(0, 80));



    const screen = await stitchTools.generateScreen({ projectId: project.id, prompt: nextPrompt });



    // Guardrail interception — must approve before continuing

    const verdict = await getAgentByName(agent.env.GUARDRAIL_AGENT, agent.id.toString())

      .then((g: any) => g.evaluatePayload({ type: "stitch-screen", payload: screen }));



    if (verdict.status === "rejected") {

      await emitMilestone(agent, requestId, `stitch:loop-${iteration}`, "blocked", verdict.reason);

      nextPrompt = verdict.correctionPrompt;

      continue;

    }



    await emitMilestone(agent, requestId, `stitch:loop-${iteration}`, "complete");



    // Brain decides whether another iteration is needed (reads .stitch/next-prompt.md baton)

    const decision = await brain.evaluateStitchProgress(agent, project, screen);

    if (decision.done) break;

    nextPrompt = decision.nextPrompt;

  }



  await emitMilestone(agent, requestId, "stitch:complete", "complete");

}

```



---



## Step 7 — `GuardrailAgent` (QA Reviewer)



**Folder**: `src/backend/src/ai/agents/GuardrailAgent/`



**Wrangler binding**: `GUARDRAIL_AGENT` (new).



**Base class**: `AIChatAgent<Env>` (so it can also be talked to directly from the UI for ad-hoc reviews).



**Files**:



| File | Responsibility |

|------|----------------|

| `index.ts` | Class shell, EdigraphService init in `onStart()` |

| `types.ts` | `Verdict`, `EvaluationPayload`, `CorrectionPrompt` |

| `health.ts` | `checkGuardrailHealth(env)` — pings Edigraph binding |

| `methods/evaluate.ts` | `evaluatePayload()` — main RPC, queries Edigraph for golden paths and returns `{ status, reason?, correctionPrompt? }` |

| `methods/subscribe.ts` | Optional: subscribe to ChatRoom WS events to do live interception (rather than waiting to be called) |

| `methods/judge.ts` | Code-quality scoring (replaces `Judge.ts`) |

| `methods/diagnose.ts` | Health diagnostician methods (replaces `HealthDiagnostician.ts`) |

| `methods/standards.ts` | Standards-checking (replaces `StandardizationAgent.ts`) |



### `evaluatePayload()` implementation sketch



```typescript

// methods/evaluate.ts

export async function evaluatePayload(agent: GuardrailAgent, input: EvaluationPayload): Promise<Verdict> {

  const { type, payload, requestId } = input;



  // Pull semantic + graph context from Edigraph

  const ctx = await agent.memory.getFullContext(

    `golden path for ${type}`,

    [type, requestId],

    { semantic: 5, graphDepth: 3 },

  );



  const violations = await agent.ai.generateStructuredResponse(

    `Evaluate this ${type} against golden paths: ${JSON.stringify(payload)}\n\nGolden paths:\n${ctx.semantic.map((s) => s.fact).join("\n")}`,

    z.object({

      passes: z.boolean(),

      violations: z.array(z.string()),

      correctionPrompt: z.string().optional(),

    }),

    "You are a strict code reviewer enforcing project golden paths.",

  );



  // Persist the verdict to episodic memory

  agent.ctx.waitUntil(agent.memory.addEpisodic(

    `Reviewed ${type}: ${violations.passes ? "PASS" : "FAIL"}`,

    { violations: violations.violations },

  ));



  return violations.passes

    ? { status: "approved" }

    : { status: "rejected", reason: violations.violations.join("; "), correctionPrompt: violations.correctionPrompt };

}

```



### Live subscription mode



The Guardrail can also opt-in to live ChatRoom subscription. In `onStart()`, it iterates known active sessions and joins each ChatRoom as a passive listener. When it sees a `milestone_update` with `name: 'jules:session-N'` and `status: 'pending_review'`, it auto-runs `evaluatePayload()` and posts the verdict back into the ChatRoom — which the EngineerAgent picks up.



---



## Step 8 — `ResearchAgent` (Librarian)



**Folder**: `src/backend/src/ai/agents/ResearchAgent/`



**Wrangler binding**: `RESEARCH_AGENT` (new).



**Base class**: `AIChatAgent<Env>`.



**Files**:



| File | Responsibility |

|------|----------------|

| `index.ts` | Class shell, lazy-init AI Provider + tools registry |

| `types.ts` | `ResearchQuery`, `ResearchResult`, `ResearchSource` |

| `health.ts` | `checkResearchHealth(env)` |

| `methods/web-search.ts` | Web search tool wiring |

| `methods/cloudflare-docs.ts` | Cloudflare Docs MCP integration via `rewriteQuestionForMCP()` |

| `methods/github.ts` | GitHub repo/issues/PRs research via MCP tools |

| `methods/discord.ts` | Wraps existing `DiscordResearchAgent` workflow (no new code — just imports + dispatch) |

| `methods/cloudflare-changelog.ts` | Wraps existing `CloudflareChangelogWorkflow` |



**Tools registration** in `index.ts`:



```typescript

import { WEB_SEARCH_TOOLS, CLOUDFLARE_DOCS_TOOLS, GITHUB_TOOLS } from "@/ai/mcp/tools";

// Discord and changelog are workflows, not inline tools — wrapped via methods



export class ResearchAgent extends AIChatAgent<Env> {

  private tools = [...WEB_SEARCH_TOOLS, ...CLOUDFLARE_DOCS_TOOLS, ...GITHUB_TOOLS];



  @callable()

  async research(query: ResearchQuery): Promise<ResearchResult> {

    return methods.dispatch(this, query);

  }

}

```



The user's directive "All MCP tools must be imported from `src/ai/mcp/tools/index.ts`" is critical — no inline tool definitions inside the agent.



---



## Step 9 — Wrangler Bindings



**File**: `wrangler.jsonc`



Add the new DO bindings (alongside the legacy ones for the additive phase):



```jsonc

{

  "durable_objects": {

    "bindings": [

      // Existing

      { "name": "CHAT_ROOM", "class_name": "ChatRoom" },

      { "name": "JULES_WEBHOOK_BROADCASTER", "class_name": "JulesWebhookBroadcaster" },



      // New MMoE bindings

      { "name": "ORCHESTRATOR_AGENT", "class_name": "OrchestratorAgent" },

      { "name": "ENGINEER_AGENT",     "class_name": "EngineerAgent" },

      { "name": "GUARDRAIL_AGENT",    "class_name": "GuardrailAgent" },

      { "name": "RESEARCH_AGENT",     "class_name": "ResearchAgent" }

    ]

  },

  "migrations": [

    // Append new migration tag

    { "tag": "vNN", "new_sqlite_classes": ["OrchestratorAgent","EngineerAgent","GuardrailAgent","ResearchAgent"] }

  ]

}

```



After Phase B is complete and no callers reference the legacy bindings, a follow-up migration tag `delete_classes` removes the old class names.



---



## Step 10 — WebSocket Status API (No New Route Needed)



Because `emitMilestone()` writes through the existing `ChatRoom` DO, the frontend can connect to the ChatRoom directly using its existing WebSocket endpoint:



```

ws://.../api/agents/chat-room/{requestId}/ws

```



The Agents SDK's built-in routing (`routeAgentRequest`) handles `chat-room` automatically once the binding name is `CHAT_ROOM`. No new route file is required — this is a meaningful simplification compared to plan v1.



Frontend filters incoming messages by `metadata.type === 'milestone_update'` to render the hierarchy diagram, and renders all other messages as the normal chat log.



---



## Step 11 — Frontend Status Page



**New file**: `src/frontend/src/views/repos/OrchestratorStatusView.tsx`



**New hook**: `src/frontend/src/hooks/useOrchestratorStatus.ts`



```typescript

import { useAgent } from "agents/react";

import type { ChatRoom } from "@backend/ai/agents/ChatRoom"; // type-only

import type { MilestoneEvent } from "@backend/ai/agents/EngineerAgent/types";



export function useOrchestratorStatus(requestId: string) {

  const [milestones, setMilestones] = useState<MilestoneEvent[]>([]);

  const [chatLog, setChatLog] = useState<Message[]>([]);



  const agent = useAgent<ChatRoom>({ agent: "chat-room", name: requestId });



  useEffect(() => {

    return agent.onMessage((raw) => {

      const msg = JSON.parse(raw);

      if (msg.metadata?.type === "milestone_update") {

        setMilestones((prev) => upsert(prev, msg.metadata.milestone));

      } else {

        setChatLog((prev) => [...prev, msg]);

      }

    });

  }, [agent]);



  return { milestones, chatLog };

}

```



### Visual hierarchy (rendered in `OrchestratorStatusView.tsx`)



```

                  ┌──────────────────┐

                  │  OrchestratorAgent  │

                  └────────┬─────────┘

                           │ assignSprint()

                ┌──────────┴──────────┐

                ▼                     ▼

       ┌────────────────┐    ┌────────────────┐

       │  EngineerAgent  │←→ │  StitchSubLoop │  (inside Engineer)

       └────────┬───────┘    └────────────────┘

                │

        ┌───────┴────────┐

        │  Milestones     │

        │  brain:eval ●   │

        │  brain:enrich ● │

        │  jules:s1 ●     │

        │  jules:s2 ●     │

        │  fleet:merge ●  │

        │  stitch:loop1 ● │

        └─────────────────┘

                          ▲

                          │ subscribed

                ┌─────────┴────────┐

                │  GuardrailAgent  │

                └──────────────────┘

```



Status colors:

- `staged` = grey

- `in_progress` = pulsing blue

- `pending_review` = amber

- `blocked` = red

- `complete` = green

- `failed` = red X



**Route**: Add `/repos/:owner/:repo/projects/:requestId/orchestration` to `src/frontend/src/routes/RepoRoutes.tsx`.



---



## Step 12 — Health Checks



**File**: `src/backend/src/ai/agents/orchestration/health.ts`



Add health probes for each MMoE agent (uses each agent's `ping()` callable):



```typescript

export async function checkOrchestratorHealth(env: Env): Promise<HealthStepResult> { /* getAgentByName(env.ORCHESTRATOR_AGENT, "global").ping() */ }

export async function checkEngineerHealth(env: Env): Promise<HealthStepResult>     { /* ENGINEER_AGENT */ }

export async function checkGuardrailHealth(env: Env): Promise<HealthStepResult>    { /* GUARDRAIL_AGENT — also pings env.EDGRAPH */ }

export async function checkResearchHealth(env: Env): Promise<HealthStepResult>     { /* RESEARCH_AGENT */ }

```



**File**: `src/backend/src/health/coordinator.ts` — register all four under `category: 'orchestration'`.



---



## Step 13 — Migration Strategy (Phase A → B → C)



### Phase A (Additive) — implement and stand up alongside legacy



1. Land `standards.ts` import fix.

2. Create `src/backend/src/db/schemas/agents/software/stateful.ts`.

3. Generate D1 migration for `chat_room_logs` rename.

4. Create the four new agent folders with full implementations.

5. Add new wrangler bindings.

6. Add new health checks.

7. Add new frontend route + hook + view.



After Phase A, both old and new agents exist. Run `pnpm run check` and `pnpm run dry-run` — must be green.



### Phase B (Switchover) — migrate every importer



1. Update routes that call legacy `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT`. Affected files (verified):

   - `src/backend/src/routes/api/agent-planning.ts`

   - `src/backend/src/routes/api/projects/sentinel/*`

   - `src/backend/src/routes/api/sandbox.ts`

   - `src/backend/src/services/planning/babysitter.ts`

2. Update frontend WS connections from `/api/planning/*` to `/api/agents/chat-room/*` via the SDK helper.

3. Update `agentStateMirror` writes to use `agentType: 'Engineer'` (not `SoftwareEngineer`).

4. Run integration tests against the new bindings.



### Phase C (Destructive cleanup) — delete legacy files



Only after Phase B is verified:



1. Delete every file in the "Files to delete" table above.

2. Remove legacy wrangler bindings (`SOFTWARE_ENGINEER_AGENT`, `STITCH_DESIGN_AGENT`, `JUDGE_AGENT`, etc.).

3. Add a destructive `delete_classes` migration in wrangler to free DO storage.

4. Final `pnpm run check`.



---



## Critical Files



### New files



| Path | Purpose |

|------|---------|

| `src/backend/src/db/schemas/agents/software/stateful.ts` | Drizzle schema for EngineerAgent DO SQLite |

| `src/backend/src/ai/agents/OrchestratorAgent/{index,types,health}.ts` + `methods/*.ts` | New PM agent |

| `src/backend/src/ai/agents/EngineerAgent/{index,types,health}.ts` + `methods/*.ts` | New Tech Lead agent |

| `src/backend/src/ai/agents/GuardrailAgent/{index,types,health}.ts` + `methods/*.ts` | New QA agent |

| `src/backend/src/ai/agents/ResearchAgent/{index,types,health}.ts` + `methods/*.ts` | New Librarian agent |

| `migrations/core/NNNN_chat_room_logs_rename.sql` | D1 ALTER TABLE |

| `src/frontend/src/hooks/useOrchestratorStatus.ts` | WS hook |

| `src/frontend/src/views/repos/OrchestratorStatusView.tsx` | Status page |



### Modified files



| Path | Change |

|------|--------|

| `src/backend/src/ai/mcp/tools/standards.ts` | Fix `honi` import → `from "ai"` |

| `src/backend/src/db/schemas/agents/mirror.ts` | Rename `planningRoomLogs` → `chatRoomLogs`, table `planning_room_logs` → `chat_room_logs` |

| `src/backend/src/db/schemas/agents/index.ts` | Update barrel re-exports |

| `src/backend/src/ai/agents/ChatRoom.ts` | Update import to `chatRoomLogs` |

| `src/backend/src/ai/agents/orchestration/health.ts` | Register 4 new health checks |

| `src/backend/src/health/coordinator.ts` | Register MMoE checks |

| `wrangler.jsonc` | New DO bindings + SQLite migrations |

| `worker-configuration.d.ts` | Regenerate after wrangler change |

| `src/frontend/src/components/PlanningCenter.tsx` | Rename inner `PlanningRoom` component → `ChatRoomPanel` |

| `src/frontend/src/views/repos/EmbeddedPlanningRoom.tsx` | Rename file → `EmbeddedChatRoom.tsx`, update title prose |

| `src/frontend/src/views/repos/ProjectsBeta.tsx` | Update import |

| `src/frontend/src/views/control/global/ChatRoomsList.tsx` | Update query keys + endpoints |

| `src/frontend/src/components/docs/SoftwareOrchestrationDoc.tsx` | Update prose |

| `src/frontend/src/components/docs/AgentDocLayout.tsx` | Update nav link |

| `src/frontend/src/routes/RepoRoutes.tsx` | Add orchestration route |



### Files to delete (Phase C only)



See "Agent Refactor Inventory" table above (~22 legacy agent files).



---



## Reused (no modification beyond imports)



- `src/backend/src/services/jules/service.ts` — `JulesService.startSession`, `startParallelSessions`, `executeMCPTool('merge_reconciliation', ...)`

- `src/backend/src/ai/providers/clients/openai/agent.ts` — `setupOpenAIAgentClient()`

- `src/backend/src/ai/providers/methods/orchestration.ts` — `rewriteQuestionForMCP()`

- `src/backend/src/services/golden-path-config.ts` — `buildCodingAgentInstructions()`

- `src/backend/src/ai/mcp/tools/standards.ts` — `makeQueryStandardsTool()` (after import fix)

- `src/backend/src/ai/mcp/tools/index.ts` — barrel of MCP tools (used by ResearchAgent)

- `src/backend/src/ai/agents/support/edigraph-memory.ts` — `EdigraphService` (used by GuardrailAgent)

- `src/backend/src/workflows/research/discord.ts` — DiscordResearch workflow (wrapped by ResearchAgent/methods/discord.ts)

- `src/backend/src/workflows/research/cloudflare-changelog.ts` — Changelog workflow

- `src/backend/src/db/schemas/agents/stateful.ts` — pattern reference for new `software/stateful.ts`

- `src/backend/src/db/schemas/agents/mirror.ts` — `agentStateMirror` (still used)

- `src/backend/src/db/schemas/jules/sessions.ts` — `julesSessions` (used for fleet recovery)

- `src/backend/src/do/JulesWebhookBroadcaster.ts` — existing WS DO (kept as legacy fan-out for non-agent flows)

- `src/backend/src/utils/do-broadcast.ts` — `BroadcastClient`



---



## Verification Plan



### Build / Type

```bash

pnpm run check        # zero TS errors after Phase A; especially the standards.ts honi import

pnpm run dry-run      # wrangler bundles with new bindings

pnpm drizzle-kit generate  # produces chat_room_logs rename migration

```



### Unit

- Extend `tests/unit/planning.test.ts` to assert `emitMilestone()` writes to all three sinks (DO Drizzle, D1, ChatRoom).

- Add `tests/unit/engineer-agent-fleet.test.ts` — covers fleet split, parallel session creation, merge gate logic.

- Add `tests/unit/guardrail-evaluate.test.ts` — covers Edigraph context fetch + structured violation extraction.



### Integration (manual, against `wrangler dev`)



1. **Standards import fix**: `pnpm run check` is green.

2. **ChatRoom rename**: D1 migration applies cleanly, `chat_room_logs` table exists, old name gone, frontend `ChatRoomsList` still renders.

3. **EngineerAgent solo task**: Submit a single-file task → watch `brain:evaluate`, `brain:enrich-docs`, `brain:enrich-standards`, `jules:session-1` milestones appear in the new status view.

4. **EngineerAgent fleet task**: Submit a multi-file task that the brain splits → verify DO Drizzle has N rows in `swe_fleet_sessions` → verify D1 `jules_sessions` has matching rows with `session_role='fleet-member'` → verify `fleet:merge` fires after all complete → Orchestrator sees a single `onTaskComplete`.

5. **Eviction recovery**: After fleet starts, restart `wrangler dev` → on next Engineer call, verify `swe_fleet_sessions` rehydrates from D1.

6. **Triangle (full-stack task)**: Submit a feature requiring frontend + backend → verify `stitch:loop-N` milestones interleave with `jules:session-N` → verify both sub-flows complete before `onTaskComplete`.

7. **Guardrail interception**: Force a violation (e.g., introduce a forbidden import) → verify `evaluatePayload` returns `rejected` → verify EngineerAgent emits a `blocked` milestone and revises the prompt.

8. **ChatRoom subscription**: Connect a second WS client to the same `requestId` ChatRoom → verify it sees both chat messages and milestone events.

9. **Health checks**: `GET /api/health` shows `orchestration.orchestrator-agent`, `engineer-agent`, `guardrail-agent`, `research-agent` all healthy.

10. **Frontend hierarchy view**: Navigate to `/repos/{owner}/{repo}/projects/{requestId}/orchestration` → confirm Orchestrator at top, Engineer + Stitch sub-loop in middle, Guardrail subscribed annotation, milestone leaves color-coded in real time.



### Phase C verification



11. After legacy deletion, `pnpm run check` is still green.

12. `wrangler dev` boots with no missing-binding warnings.

13. End-to-end smoke test against staging — submit a representative full-stack task, watch all milestones, confirm a single PR is opened.



---



## Open Questions for User Review



Before implementation begins, the following ambiguities should be confirmed:



1. **Wrangler binding rename**: Is it acceptable to rename `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` (which forces a new SQLite class migration), or should the new agent reuse the existing binding name to preserve DO storage continuity?

2. **Legacy DO storage**: When deleting `SoftwareEngineerAgent`, do you want to drop its existing DO SQLite contents, or migrate any persisted state forward?

3. **`StitchDesignAgent` fate**: The plan absorbs it into `EngineerAgent/methods/stitch-orchestrator.ts`. Confirm there are no external consumers of the standalone Stitch agent that would break.

4. **Phase C timing**: Should Phase C (legacy deletion) ship in the same PR as Phase A+B, or as a follow-up after one production cycle to allow rollback?

5. **`assistant-ui` Vercel AI SDK Data Stream**: Confirm the OrchestratorAgent's `onChatMessage` should produce `text-delta` / `tool-call` / `tool-result` parts in the Vercel format (not the legacy custom format the existing PlanningRoom uses).

