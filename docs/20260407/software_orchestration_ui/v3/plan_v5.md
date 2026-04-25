# Implementation Plan — Software Orchestration UI v3 — Version 5 (Production Release Plan)



> **Plan-mode note**: Plan mode is active, so this is being authored at the assigned plan file. After approval (via `ExitPlanMode`), the implementation phase should copy this content into `docs/20260407/software_orchestration_ui/v3/plan_v5.md` (and overwrite or supersede the older `plan_v2.md`/`plan_v4.md` drafts in that directory) so the docs tree carries the locked v5 spec.



---



## v5 Locked Decisions (Production Release)



These five locks are the irreversible decisions that v5 formalizes. Every code change in this plan flows from one of them:



| # | Lock | Definitive answer |

|---|------|---|

| L1 | **Phase A Priority — The Honi Purge** | Step 1 is the absolute removal of `@utils/honi-client` and `HoniClient` logic from all 24 route/workflow files plus the two broken `@/ai/agents/honi` imports. **`pnpm run check` must be green before any Phase B work begins.** No exceptions. |

| L2 | **ChatRoom Substrate Naming** | Room IDs use the **`prefix-{id}`** convention. The canonical prefixes are `request-`, `epic-`, `task-`, `sprint-`, `session-` (Jules), and `review-` (PR). No bare-id rooms. The `ChatRoom` DO class exposes exactly three new `@callable()` methods: `post(source, text, metadata?)`, `tail(limit?)`, `subscribe(subscriberAgent)`. |

| L3 | **Milestone Emission = Option A** | `ChatRoom.post()` is the **single source of truth** for the D1 mirror via its existing `mirrorToD1()` call. `EngineerAgent.emitMilestone()` does NOT write to D1 directly. One write, no dedupe. (Removed the v4 "tradeoff" framing.) |

| L4 | **Guardrail Golden-Path Authority** | `methods/cloudflare-docs.ts` and `rewriteQuestionForMCPImpl` are **exclusively owned by `GuardrailAgent`**. `ResearchAgent` does NOT import `CLOUDFLARE_DOCS_TOOLS` and does NOT call `rewriteQuestionForMCPImpl`. The Guardrail is the single gatekeeper for infrastructure, bindings, and Worker logic. |

| L5 | **Zero-Downtime Routing in Phase B** | Phase B installs RPC bridges (preferred) or 302 redirects (fallback) so legacy paths stay alive for one release cycle: `/api/planning/*` → `/api/chat-rooms/*` and `/api/agents/session*` → `/api/orchestrator/requests/*`. Every frontend `useAgent` hook switches to the `agent: "chat-room"` pattern with dynamic room naming. The `OrchestratorStatusView.tsx` Live Simulator implements first-render hydration via `chatRoom.tail(200)`. |



---



## Context



The `SoftwareEngineerAgent` is currently a thin Jules session launcher with mirrored state in D1 but no internal brain, no fleet supervision, no Stitch collaboration, and no live progress UI. Over the same period, the `src/backend/src/ai/agents/` directory has fragmented into ~40+ overlapping agents (multiple Orchestrators, multiple Researchers, dead `honi` imports, duplicated planning/supervisor classes). Meanwhile, 24+ route files still import a dead `HoniClient` helper from `@utils/honi-client` that no longer exists. The user wants five coordinated changes landed in one plan:



1. **Modularization**: Collapse `src/backend/src/ai/agents/` into 4 MMoE (Mixture-of-Modular-Experts) agents — `OrchestratorAgent`, `EngineerAgent`, `GuardrailAgent`, `ResearchAgent` — each with a strict folder layout (`index.ts` + `types.ts` + `health.ts` + `methods/*.ts`).

2. **Universal ChatRoom substrate**: Finish the partially-completed `PlanningRoom` → `ChatRoom` rename. ChatRoom is **no longer a planning-only room**. It is a universal collaboration substrate that can be stood up under any unique ID (`epic-abc`, `task-123`, `sprint-44`, `session-{julesId}`, `review-{prNumber}`) — each instance is siloed to its own Durable Object, WebSocket-subscribable from any client or agent, and acts as the single event hub through which multi-agent collaboration flows (milestone updates, Jules questions, Guardrail verdicts, Orchestrator nudges).

3. **Drizzle-managed agent state + transparency UI**: Replace raw `this.sql` strings with a proper Drizzle schema at `src/backend/src/db/schemas/agents/software/stateful.ts`, mirror to D1 for eviction recovery, emit milestones through the ChatRoom substrate so the frontend "Live Simulator" hierarchy diagram updates in real time.

4. **GuardrailAgent owns Cloudflare-docs golden-path enforcement**: Move `methods/cloudflare-docs.ts` logic out of `ResearchAgent` and entirely under `GuardrailAgent`. The Guardrail uses `rewriteQuestionForMCPImpl` (from `src/backend/src/ai/providers/methods/orchestration.ts`) to align agent actions with the latest Cloudflare Worker documentation patterns. The Guardrail is the single gatekeeper ensuring every Worker implementation follows golden paths — the ResearchAgent no longer ships docs calls.

5. **Purge dead `honi` imports**: Remove every `import { HoniClient } from '@utils/honi-client'` across 24 route/workflow files, and fix the two remaining broken `@/ai/agents/honi` imports (`mcp/tools/standards.ts`, `workflows/research/discord.ts`). This is the blocker that is currently breaking `pnpm run check`.



The end state is a transparent, modular orchestration layer where the Orchestrator delegates a Sprint to the Engineer, the Engineer internally fleet-orchestrates Jules + Stitch sessions inside a shared ChatRoom, the Guardrail intercepts payloads against the latest Cloudflare docs and Edigraph "golden paths", and the user watches the entire hierarchy update live in the frontend Live Simulator view.



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



## File Refactor Inventory (v5)



This is the canonical file-by-file plan. Every file in the repo that touches this work is in exactly one of three buckets: **delete**, **modify**, or **create**. There is no "maybe later" bucket.



### A. Backend agents — files to delete in Phase C (legacy / redundant)



Verify no remaining importers in Phase B before deleting any of these in Phase C.



| File to delete | Replaced by | Migration target agent |

|------|-------------|---|

| `src/backend/src/ai/agents/Planner.ts` | `OrchestratorAgent/methods/plan.ts` | Orchestrator |

| `src/backend/src/ai/agents/Supervisor.ts` | `OrchestratorAgent/methods/supervise.ts` | Orchestrator |

| `src/backend/src/ai/agents/TopicOrchestrator.ts` | `OrchestratorAgent/methods/dispatch.ts` | Orchestrator |

| `src/backend/src/ai/agents/master/OrchestratorAgent.ts` | New `OrchestratorAgent/index.ts` | Orchestrator |

| `src/backend/src/ai/agents/master/OverseerAgent.ts` | `OrchestratorAgent/methods/overseer.ts` | Orchestrator |

| `src/backend/src/ai/agents/planning/Orchestrator.ts` | `OrchestratorAgent/methods/dispatch.ts` | Orchestrator |

| `src/backend/src/ai/agents/planning/Supervisor.ts` | `OrchestratorAgent/methods/supervise.ts` | Orchestrator |

| `src/backend/src/ai/agents/orchestration/base-orchestrator.ts` | `OrchestratorAgent/methods/base.ts` | Orchestrator |

| `src/backend/src/ai/agents/orchestration/task-orchestrator.ts` | `EngineerAgent/methods/task.ts` | Engineer |

| `src/backend/src/ai/agents/implementers/SoftwareEngineerAgent.ts` | `EngineerAgent/index.ts` | Engineer |

| `src/backend/src/ai/agents/implementers/ResearchAgent.ts` | `ResearchAgent/index.ts` | Research |

| `src/backend/src/ai/agents/StitchDesignAgent.ts` | `EngineerAgent/methods/stitch-orchestrator.ts` | Engineer |

| `src/backend/src/ai/agents/SandboxAgent.ts` | `EngineerAgent/methods/sandbox.ts` | Engineer |

| `src/backend/src/ai/agents/LandingPageAgent.ts` | `EngineerAgent/methods/landing-page.ts` | Engineer |

| `src/backend/src/ai/agents/Judge.ts` | `GuardrailAgent/methods/judge.ts` | Guardrail |

| `src/backend/src/ai/agents/HealthDiagnostician.ts` | `GuardrailAgent/methods/diagnose.ts` | Guardrail |

| `src/backend/src/ai/agents/StandardizationAgent.ts` | `GuardrailAgent/methods/standards.ts` | Guardrail |

| `src/backend/src/ai/agents/Research.ts` (already deleted) | `ResearchAgent/index.ts` | Research |

| `src/backend/src/ai/agents/WebSearch.ts` | `ResearchAgent/methods/web-search.ts` | Research |

| `src/backend/src/ai/agents/DeepResearchChat.ts` | `ResearchAgent/methods/deep-research.ts` | Research |

| `src/backend/src/ai/agents/research/DiscordResearch.ts` | `ResearchAgent/methods/discord.ts` (wraps existing workflow) | Research |

| `src/backend/src/ai/agents/CloudflareDocs.ts` | `GuardrailAgent/methods/cloudflare-docs.ts` (moved from Research → Guardrail per Lock L4) | Guardrail |



### B. Backend agents — files to keep as-is



These already have the correct shape and are out of scope for consolidation. They MUST NOT be modified by this plan beyond import updates.



- `src/backend/src/ai/agents/ChatRoom.ts` — already `AIChatAgent`; gets the three new `@callable()` methods (Step 3h) but stays in place

- `src/backend/src/ai/agents/support/edigraph-memory.ts` — used by GuardrailAgent

- `src/backend/src/ai/agents/support/agent-utils.ts`, `support/structured-chat.ts` — utility helpers

- `src/backend/src/ai/agents/github/RepoAgent.ts`, `github/PrReviewer.ts` — specialized AIChatAgent subclasses tied to specific GitHub flows

- `src/backend/src/ai/agents/workshop/UxResearcher.ts` — workshop-specific, separate concern

- `src/backend/src/ai/agents/patterns/*` — reusable orchestration patterns, not agent classes



### C. Files that get the Honi Purge in Phase A (Lock L1)



**Two broken `@/ai/agents/honi` imports** (Step 1a):

1. `src/backend/src/ai/mcp/tools/standards.ts` → change to `import { tool } from "ai"`

2. `src/backend/src/workflows/research/discord.ts` → remove import, refactor body to native Cloudflare Workflow `ctx.step.do(...)` API



**24 files importing `HoniClient` from `@utils/honi-client`** (Step 1b — every one of these gets the import line removed and call sites rewritten per the three-bucket strategy):



```

src/backend/src/ai/agents/health.ts

src/backend/src/routes/api/agents/chat.ts

src/backend/src/routes/api/agents/deep-research-chat.ts

src/backend/src/routes/api/agents/jules.ts

src/backend/src/routes/api/agents/session.ts

src/backend/src/routes/api/agents/sessionStatus.ts

src/backend/src/routes/api/agents/workshop-chat.ts

src/backend/src/routes/api/cloudflare/chat.ts

src/backend/src/routes/api/frontend/ai/chat.ts

src/backend/src/routes/api/frontend/repos/actions.ts

src/backend/src/routes/api/frontend/research/one-time.ts

src/backend/src/routes/api/frontend/workshop.ts

src/backend/src/routes/api/jules/index.ts

src/backend/src/routes/api/ops/health.ts

src/backend/src/routes/api/ops/ops.ts

src/backend/src/routes/api/planning.ts

src/backend/src/routes/api/research-orchestration.ts

src/backend/src/routes/api/reverse-engineering.ts

src/backend/src/routes/api/ux/index.ts

src/backend/src/routes/api/webhooks/index.ts

src/backend/src/routes/api/webhooks/jules.ts

src/backend/src/routes/rpc/service.ts

src/backend/src/workflows/research/topic.ts

src/backend/src/workflows/search.ts

```



### D. New files created in Phase A



| Path | Purpose |

|------|---------|

| `src/backend/src/db/schemas/agents/software/stateful.ts` | Drizzle schema for `sweFleetSessions` + `sweMilestones` (DO SQLite) |

| `src/backend/src/ai/agents/OrchestratorAgent/index.ts` | PM agent class shell (`AIChatAgent<Env, OrchestratorState>`) |

| `src/backend/src/ai/agents/OrchestratorAgent/types.ts` | `Sprint`, `Epic`, `UserStory`, `Task`, `OrchestratorState` |

| `src/backend/src/ai/agents/OrchestratorAgent/health.ts` | `checkOrchestratorHealth(env)` |

| `src/backend/src/ai/agents/OrchestratorAgent/methods/parse-request.ts` | User prompt → SWARM Task tree |

| `src/backend/src/ai/agents/OrchestratorAgent/methods/dispatch.ts` | `assignSprintToEngineer()` via RPC |

| `src/backend/src/ai/agents/OrchestratorAgent/methods/subscribe-rooms.ts` | Subscribes to active `request-*` rooms, reacts to milestone/verdict events |

| `src/backend/src/ai/agents/OrchestratorAgent/methods/onMessage.ts` | Vercel AI SDK Data Stream message handler |

| `src/backend/src/ai/agents/EngineerAgent/index.ts` | Tech Lead agent class shell |

| `src/backend/src/ai/agents/EngineerAgent/types.ts` | `Sprint`, `Subtask`, `MilestoneEvent`, `MilestoneStatus`, `EngineerState` |

| `src/backend/src/ai/agents/EngineerAgent/health.ts` | `checkEngineerHealth(env)` |

| `src/backend/src/ai/agents/EngineerAgent/methods/brain.ts` | OpenAI Agents SDK brain — solo vs fleet vs triangle decision |

| `src/backend/src/ai/agents/EngineerAgent/methods/enrich.ts` | Coding-agent instructions + standards tool + Guardrail-bridged Cloudflare golden-path lookup |

| `src/backend/src/ai/agents/EngineerAgent/methods/jules-orchestrator.ts` | `runFleet`, `enrichAndStartSession`, fleet merge logic |

| `src/backend/src/ai/agents/EngineerAgent/methods/stitch-orchestrator.ts` | Stitch Build Loop with `.stitch/next-prompt.md` baton |

| `src/backend/src/ai/agents/EngineerAgent/methods/triangle.ts` | Stitch + Jules coordination |

| `src/backend/src/ai/agents/EngineerAgent/methods/milestones.ts` | `emitMilestone()` per Step 10.1 sequence (Lock L3 — Option A) |

| `src/backend/src/ai/agents/EngineerAgent/methods/guardrail-bridge.ts` | Calls `GuardrailAgent.evaluatePayload()` before approving any Jules PR / Stitch screen |

| `src/backend/src/ai/agents/GuardrailAgent/index.ts` | QA agent class shell, EdigraphService init in `onStart()` |

| `src/backend/src/ai/agents/GuardrailAgent/types.ts` | `Verdict`, `EvaluationPayload`, `CorrectionPrompt`, `CloudflareGoldenPathCheck` |

| `src/backend/src/ai/agents/GuardrailAgent/health.ts` | `checkGuardrailHealth(env)` — pings Edigraph + Cloudflare Docs MCP |

| `src/backend/src/ai/agents/GuardrailAgent/methods/evaluate.ts` | `evaluatePayload()` — main RPC routing both Edigraph + Cloudflare-docs checks |

| `src/backend/src/ai/agents/GuardrailAgent/methods/cloudflare-docs.ts` | **Lock L4: exclusively owned here.** `fetchCloudflareGoldenPath()` using `rewriteQuestionForMCPImpl` |

| `src/backend/src/ai/agents/GuardrailAgent/methods/subscribe.ts` | Live ChatRoom subscription, auto-evaluates `pending_review` milestones |

| `src/backend/src/ai/agents/GuardrailAgent/methods/judge.ts` | Code-quality scoring (replaces `Judge.ts`) |

| `src/backend/src/ai/agents/GuardrailAgent/methods/diagnose.ts` | Health diagnostician (replaces `HealthDiagnostician.ts`) |

| `src/backend/src/ai/agents/GuardrailAgent/methods/standards.ts` | Internal standards-checking (replaces `StandardizationAgent.ts`) |

| `src/backend/src/ai/agents/ResearchAgent/index.ts` | Librarian agent class shell |

| `src/backend/src/ai/agents/ResearchAgent/types.ts` | `ResearchQuery`, `ResearchResult`, `ResearchSource` |

| `src/backend/src/ai/agents/ResearchAgent/health.ts` | `checkResearchHealth(env)` |

| `src/backend/src/ai/agents/ResearchAgent/methods/web-search.ts` | Web search tool wiring |

| `src/backend/src/ai/agents/ResearchAgent/methods/github.ts` | GitHub repo/issues/PRs research via MCP tools |

| `src/backend/src/ai/agents/ResearchAgent/methods/discord.ts` | Wraps existing Discord workflow |

| `src/backend/src/ai/agents/ResearchAgent/methods/cloudflare-changelog.ts` | Wraps existing CloudflareChangelogWorkflow (RSS digest, NOT docs lookup) |

| `migrations/core/NNNN_chat_room_logs_rename.sql` | D1 ALTER TABLE `planning_room_logs` → `chat_room_logs` |

| `src/frontend/src/lib/chat-room-id.ts` | `chatRoomId(prefix, id)` helper enforcing `prefix-{id}` convention (Lock L2) |

| `src/frontend/src/hooks/useOrchestratorStatus.ts` | WS hook subscribing to `request-${requestId}` ChatRoom + `tail(200)` hydration |

| `src/frontend/src/hooks/useOrchestratorRuntime.ts` | Assistant-UI runtime hook for `ORCHESTRATOR_AGENT` |

| `src/frontend/src/views/repos/OrchestratorStatusView.tsx` | Live Simulator status page (Lock L5) |

| `docs/20260407/software_orchestration_ui/v3/honi-replacements.md` | Scratch doc for Step 1b — ephemeral, deleted before merge |

| `docs/20260407/software_orchestration_ui/v3/plan_v2.md` | Mirror of this v5 plan, copied after `ExitPlanMode` approval |



### E. Files modified in Phase A/B



| Path | Change | Phase |

|------|--------|---|

| `src/backend/src/ai/mcp/tools/standards.ts` | Fix `honi` import → `from "ai"` | A (Step 1a) |

| `src/backend/src/workflows/research/discord.ts` | Remove `from '@/ai/agents/honi'`, refactor to native Workflow API | A (Step 1a) |

| **24 files in section C above** | Remove `HoniClient` import + rewrite call sites | A (Step 1b) |

| `src/backend/src/db/schemas/agents/mirror.ts` | Rename `planningRoomLogs` → `chatRoomLogs`, table `planning_room_logs` → `chat_room_logs` | A |

| `src/backend/src/db/schemas/agents/index.ts` | Update barrel re-exports | A |

| `src/backend/src/ai/agents/ChatRoom.ts` | Update import to `chatRoomLogs` AND add `@callable() post()`, `tail()`, `subscribe()` (Step 3h, Lock L2) | A |

| `src/backend/src/ai/agents/orchestration/health.ts` | Register 4 new health checks | A |

| `src/backend/src/health/coordinator.ts` | Register MMoE checks | A |

| `wrangler.jsonc` | New DO bindings + SQLite migration tag | A |

| `worker-configuration.d.ts` | Regenerate after wrangler change | A |

| `src/backend/src/routes/api/planning.ts` | Convert to RPC bridge (Lock L5) | B |

| `src/backend/src/routes/api/agent-planning.ts` | Convert to RPC bridge (Lock L5) | B |

| `src/backend/src/routes/api/agents/session.ts` | Convert to RPC bridge (Lock L5) | B |

| `src/backend/src/routes/api/agents/sessionStatus.ts` | Convert to RPC bridge (Lock L5) | B |

| `src/backend/src/routes/api/projects/sentinel/*` | Switch `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` | B |

| `src/backend/src/routes/api/sandbox.ts` | Switch `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` | B |

| `src/backend/src/services/planning/babysitter.ts` | Switch `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` | B |

| `src/frontend/src/components/PlanningCenter.tsx` | Rename inner `PlanningRoom` → `ChatRoomPanel` | A |

| `src/frontend/src/views/repos/EmbeddedPlanningRoom.tsx` | Rename file → `EmbeddedChatRoom.tsx` | A |

| `src/frontend/src/views/repos/ProjectsBeta.tsx` | Update import | A |

| `src/frontend/src/views/control/global/ChatRoomsList.tsx` | Update query keys + endpoints to `/api/chat-rooms/active` | B |

| `src/frontend/src/views/control/global/Chat.tsx` | Rewire to `ORCHESTRATOR_AGENT` via `useOrchestratorRuntime` | B |

| `src/frontend/src/views/control/global/useAgentRuntime.ts` | Add named `useOrchestratorRuntime` variant | B |

| `src/frontend/src/views/research/DeepResearchChatPage.tsx` | Rewire to `RESEARCH_AGENT` | B |

| `src/frontend/src/components/docs/SoftwareOrchestrationDoc.tsx` | Update prose (ChatRoom = universal substrate, Guardrail owns Cloudflare docs) | A |

| `src/frontend/src/components/docs/AgentDocLayout.tsx` | Update nav link | A |

| `src/frontend/src/routes/RepoRoutes.tsx` | Add `/live-simulator` route (alias `/orchestration` for one release) | B |

| **Every existing `useAgent({ agent: "..." })` site in `src/frontend/`** | Switch to `useAgent({ agent: "chat-room", name: chatRoomId(prefix, id) })` (Lock L5) | B |



### Migration is **additive-then-destructive**



Phase A creates the new agents alongside the old. Phase B switches every importer (routes, health checks, frontend WS routes) to the new bindings AND installs the zero-downtime bridges. Phase C deletes the legacy files only after `pnpm run check` is green and the bridges have been verified for one release cycle.



---



## Step 1 — Phase A Priority: The Honi Purge (Blocking Fix, Lock L1)



> **v5 lock L1**: This is the **first** thing that lands. No new MMoE code, no schema rename, no frontend rewires happen until `pnpm run check` is green. The purge has its own commit; the rest of Phase A rebases on top of it. This ordering is non-negotiable because every other step in this plan imports types or routes through files that currently fail to compile.



The backend currently fails `pnpm run check` because two files still `import` from a deleted `@/ai/agents/honi` module, and 24 route/workflow files still `import { HoniClient } from '@utils/honi-client'` which no longer exists. This entire cleanup must land first or nothing else compiles.



### 1a. Fix the two broken `@/ai/agents/honi` imports



**File 1**: `src/backend/src/ai/mcp/tools/standards.ts`



```diff

-import { tool } from "@/ai/agents/honi";

+import { tool } from "ai";

```



**File 2**: `src/backend/src/workflows/research/discord.ts`



```diff

-import { workflow, step } from '@/ai/agents/honi';

+// Use native Cloudflare Workflow step API (ctx.step.do) — no replacement import needed.

```



Refactor the workflow body to use the Cloudflare Workflow native `ctx.step.do(...)` / `ctx.step.sleep(...)` pattern it's already wrapped in. Verify the pre-existing `CloudflareChangelogWorkflow` as the reference implementation (`src/backend/src/workflows/research/cloudflare-changelog.ts`).



### 1b. Purge all `HoniClient` importers (24 files)



Verified importers (from `grep -l "HoniClient"`):



```

src/backend/src/ai/agents/health.ts

src/backend/src/routes/api/agents/chat.ts

src/backend/src/routes/api/agents/deep-research-chat.ts

src/backend/src/routes/api/agents/jules.ts

src/backend/src/routes/api/agents/session.ts

src/backend/src/routes/api/agents/sessionStatus.ts

src/backend/src/routes/api/agents/workshop-chat.ts

src/backend/src/routes/api/cloudflare/chat.ts

src/backend/src/routes/api/frontend/ai/chat.ts

src/backend/src/routes/api/frontend/repos/actions.ts

src/backend/src/routes/api/frontend/research/one-time.ts

src/backend/src/routes/api/frontend/workshop.ts

src/backend/src/routes/api/jules/index.ts

src/backend/src/routes/api/ops/health.ts

src/backend/src/routes/api/ops/ops.ts

src/backend/src/routes/api/planning.ts

src/backend/src/routes/api/research-orchestration.ts

src/backend/src/routes/api/reverse-engineering.ts

src/backend/src/routes/api/ux/index.ts

src/backend/src/routes/api/webhooks/index.ts

src/backend/src/routes/api/webhooks/jules.ts

src/backend/src/routes/rpc/service.ts

src/backend/src/workflows/research/topic.ts

src/backend/src/workflows/search.ts

```



For each file:

1. Delete the `import { HoniClient } from '@utils/honi-client';` line.

2. Find every `new HoniClient(...)` instantiation and every `HoniClient.xxx()` static call. Each usage falls into one of three buckets:

   - **Agent RPC**: replace with `getAgentByName(env.ORCHESTRATOR_AGENT, roomId)` + direct RPC call on the MMoE agent target.

   - **Internal HTTP proxy**: replace with a direct call to `JulesService` / `AIProvider` / existing service singleton.

   - **Dead code**: if the route handler only referenced HoniClient to do something that no longer exists, remove the branch entirely.

3. Remove any now-unused helper imports the HoniClient line pulled in.



This is mechanical but large — ~40 call sites across 24 files. The replacement table should be authored as a scratch doc during implementation (`docs/20260407/software_orchestration_ui/v3/honi-replacements.md`) so the diff is easy to review.



### 1c. Green-build gate (the Lock L1 acceptance criterion)



After Step 1a + 1b, the following commands MUST all exit zero before any subsequent step (Drizzle schema, ChatRoom callable additions, MMoE agent folders) is authored:



```bash

pnpm run check          # zero TS errors

pnpm run lint           # zero lint errors

pnpm run dry-run        # wrangler bundles cleanly

grep -r "HoniClient" src/  # zero matches

grep -r "@utils/honi-client" src/  # zero matches

grep -r "@/ai/agents/honi" src/  # zero matches

```



If any of these fails, do not advance. Treat the purge as its own PR and merge it before opening the MMoE PR.



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



### 3g. Universal ChatRoom semantics — the collaboration substrate contract



**ChatRoom is no longer a planning-only room.** It is the universal collaboration substrate of the system. The contract:



1. **Any unique ID can mint a room.** A ChatRoom DO instance is addressed by a single `roomId` string. The room is whatever that ID refers to. Examples:

   - `roomId = "epic-abc"` — an Epic-level collaboration thread shared by Orchestrator + Engineer + Guardrail

   - `roomId = "task-123"` — a single-task working room

   - `roomId = "sprint-44"` — a sprint-level room where the Orchestrator posts dispatch events

   - `roomId = "session-{julesSessionId}"` — a Jules-session-scoped room where Engineer posts milestones and Jules webhook events land

   - `roomId = "review-{prNumber}"` — a PR review thread where Guardrail posts verdicts

   - `roomId = "request-{planningRequestId}"` — the top-level user request room (what the Live Simulator view subscribes to)

2. **Siloed.** Each `roomId` is a separate Durable Object instance with its own embedded SQLite and its own WebSocket hub. Messages in room A never leak into room B. Mirror rows in D1 `chat_room_logs` are tagged with `roomId` and are queryable for post-hoc inspection.

3. **Subscribable by any client.** The frontend uses `useAgent({ agent: "chat-room", name: roomId })` from the Agents SDK. Any backend code can subscribe by opening a server-side WebSocket to the DO (via Agents SDK internal RPC) or by calling `chatRoomLogs` D1 reads for snapshot queries.

4. **The event hub for multi-agent collaboration.** All of the following flow through ChatRoom messages:

   - Milestone updates (`metadata.type === 'milestone_update'`)

   - Jules webhook events forwarded by `JulesWebhookBroadcaster` (`metadata.type === 'jules_event'`)

   - Guardrail verdicts (`metadata.type === 'guardrail_verdict'`)

   - Orchestrator dispatch / question / approve messages (`metadata.type === 'orchestrator_action'`)

   - Stitch Build Loop iteration results (`metadata.type === 'stitch_iteration'`)

   - Plain human chat messages (no `metadata.type` — default rendering)

5. **The Orchestrator is always subscribed.** For every active `request-*` room, the `OrchestratorAgent` opens a server-side WebSocket in `onStart()` (using `getAgentByName(env.CHAT_ROOM, roomId)` and calling a new `subscribe(agentName)` RPC on the ChatRoom class). When the Orchestrator sees:

   - a Jules `waiting_for_user` question → it either auto-answers from the Sprint spec or escalates to the human via the Live Simulator

   - a Guardrail rejection → it re-prompts the Engineer with the correction prompt or halts the sprint

   - a `plan:ready` milestone → it auto-approves (or flags for human review per policy)

   - a `stitch:loop-N blocked` → it nudges the Engineer's brain to revise the design spec

   - a `fleet:merge complete` → it fires `onTaskComplete` upstream



### 3h. `ChatRoom` class additions required by this plan



The current `ChatRoom.ts` only exposes `ping`, `onConnect`, `onMessage`, `onClose`, `mirrorToD1`. To support the universal substrate contract, add:



```typescript

@callable()

async post(source: string, text: string, metadata?: any): Promise<void> {

  // Allows server-side agents (Engineer, Guardrail, Orchestrator) to inject

  // messages into the room without opening a real WebSocket connection.

  // Broadcasts + mirrors just like onMessage().

}



@callable()

async tail(limit = 50): Promise<Message[]> {

  // Snapshot read of the room's recent messages from DO SQLite.

  // Used by the Live Simulator on first render before the WS stream catches up.

}



@callable()

async subscribe(subscriberAgent: string): Promise<void> {

  // Records that `subscriberAgent` is listening. Used so the room can push

  // high-priority events to the subscriber via RPC instead of waiting for

  // a WebSocket poll.

}

```



These three new `@callable()` methods turn ChatRoom into a true RPC substrate usable by agents that don't want the WS client overhead.



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

| `methods/subscribe-rooms.ts` | For each active `request-{id}` room, call `ChatRoom.subscribe("OrchestratorAgent")` and register reactions for `milestone_update`/`guardrail_verdict`/`jules_event` types; inject auto-responses via `ChatRoom.post()` |

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

| `methods/enrich.ts` | `buildCodingAgentInstructions()` + `makeQueryStandardsTool()` + delegation to `GuardrailAgent.fetchCloudflareGoldenPath()` (Engineer does NOT call Cloudflare Docs MCP directly — Guardrail owns that path) |

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



  // 2. (Lock L3) NO direct D1 write here. ChatRoom.post() is the single

  //    source of truth for the D1 mirror via its mirrorToD1() call. This

  //    is non-negotiable — see Step 10.1 for the full sequence and Step

  //    10.2 for the rationale. CI greps EngineerAgent/methods/ for any

  //    `chatRoomLogs` reference and fails the build if found.



  // 3. Broadcast to all WS clients via the shared ChatRoom for this request.

  //    Uses the new @callable() post() method added in Step 3h so server-side

  //    agents can inject messages without opening a real WS connection. The

  //    room is keyed by `request-${requestId}` per Step 3g room-ID convention.

  agent.ctx.waitUntil((async () => {

    const room = await getAgentByName(agent.env.CHAT_ROOM, `request-${requestId}`);

    await (room as any).post(

      "EngineerAgent",

      `${name} → ${status}`,

      { type: "milestone_update", milestone: { id, name, status, sessionId, detail, timestamp: Date.now() } },

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



## Step 7 — `GuardrailAgent` (QA Reviewer + Cloudflare-Docs Gatekeeper)



**Folder**: `src/backend/src/ai/agents/GuardrailAgent/`



**Wrangler binding**: `GUARDRAIL_AGENT` (new).



**Base class**: `AIChatAgent<Env>` (so it can also be talked to directly from the UI for ad-hoc reviews).



### Responsibility expansion (important)



GuardrailAgent now owns **two** gatekeeping responsibilities that were previously split:



1. **Project golden-path enforcement** (Edigraph-backed). Evaluates Jules PRs, Stitch screens, Engineer enrichment payloads against the rules/facts stored in Edigraph semantic + graph memory.

2. **Cloudflare Worker golden-path enforcement** (Cloudflare-docs-backed). Evaluates Worker implementations against the *latest* Cloudflare documentation using the Cloudflare Docs MCP tools. This logic is moved here from `ResearchAgent` because the Guardrail is the single gatekeeper for golden-path compliance — the ResearchAgent should not be in the critical path of approving code.



The Engineer **must** call `await getAgentByName(env.GUARDRAIL_AGENT, requestId).evaluatePayload(...)` before approving any Jules PR, any Stitch screen, any infrastructure binding change, or any Cloudflare-touching code path. The Guardrail is the only path to "golden path approved."



**Files**:



| File | Responsibility |

|------|----------------|

| `index.ts` | Class shell, EdigraphService init in `onStart()`, Cloudflare Docs MCP client init |

| `types.ts` | `Verdict`, `EvaluationPayload`, `CorrectionPrompt`, `CloudflareGoldenPathCheck` |

| `health.ts` | `checkGuardrailHealth(env)` — pings Edigraph binding + Cloudflare Docs MCP |

| `methods/evaluate.ts` | `evaluatePayload()` — main RPC; routes to Edigraph checks, Cloudflare-docs checks, or both based on payload `type` |

| `methods/cloudflare-docs.ts` | **Moved from ResearchAgent.** Wraps `rewriteQuestionForMCPImpl` + `CLOUDFLARE_DOCS_TOOLS` to look up the latest Worker patterns for the payload under review |

| `methods/subscribe.ts` | Subscribe to ChatRoom WS events for live interception (auto-runs `evaluatePayload` on `pending_review` milestones and posts verdicts) |

| `methods/judge.ts` | Code-quality scoring (replaces `Judge.ts`) |

| `methods/diagnose.ts` | Health diagnostician methods (replaces `HealthDiagnostician.ts`) |

| `methods/standards.ts` | Internal standards-checking (replaces `StandardizationAgent.ts`) |



### `methods/cloudflare-docs.ts` — golden-path lookup via MCP



```typescript

// methods/cloudflare-docs.ts

import { rewriteQuestionForMCPImpl } from "@/ai/providers/methods/orchestration";

import { CLOUDFLARE_DOCS_TOOLS } from "@/ai/mcp/tools";

import type { GuardrailAgent } from "../index";



/**

 * Given an evaluation payload that touches Cloudflare (Workers, DOs,

 * Workflows, Queues, R2, KV, D1, Vectorize, AI bindings, etc.), look up

 * the latest golden-path guidance from the Cloudflare docs via MCP.

 *

 * Returns a concise golden-path summary that `evaluatePayload` then feeds

 * into the structured violations extractor alongside Edigraph semantic

 * context.

 */

export async function fetchCloudflareGoldenPath(

  agent: GuardrailAgent,

  payloadSummary: string,

  tags: string[],            // e.g. ['durable-objects','websockets','drizzle']

): Promise<string> {

  // Use rewriteQuestionForMCPImpl to turn a free-form summary into an

  // MCP-optimized doc lookup query. The existing implementation lives in

  // src/backend/src/ai/providers/methods/orchestration.ts:24.

  const mcpQuery = await rewriteQuestionForMCPImpl(

    agent.ai,

    `What is the latest Cloudflare Worker golden path for: ${payloadSummary}. Tags: ${tags.join(", ")}`,

    { tags, source: "guardrail" },

  );



  // Run the rewritten query through the Cloudflare Docs MCP tool suite.

  const results = await CLOUDFLARE_DOCS_TOOLS.search(agent.env, mcpQuery, { limit: 5 });



  return results.map((r) => `• ${r.title}\n${r.snippet}`).join("\n\n");

}

```



### `evaluatePayload()` implementation sketch



```typescript

// methods/evaluate.ts

import { fetchCloudflareGoldenPath } from "./cloudflare-docs";



export async function evaluatePayload(agent: GuardrailAgent, input: EvaluationPayload): Promise<Verdict> {

  const { type, payload, requestId, tags = [] } = input;



  // 1. Pull project-level semantic + graph context from Edigraph

  const edigraphCtx = await agent.memory.getFullContext(

    `golden path for ${type}`,

    [type, requestId],

    { semantic: 5, graphDepth: 3 },

  );



  // 2. If the payload touches Cloudflare, look up the current docs golden path

  const touchesCloudflare =

    tags.some((t) => /^(workers|durable-objects|workflows|queues|r2|kv|d1|vectorize|ai|hyperdrive|pages)/.test(t)) ||

    /cloudflare|worker|durable ?object|wrangler|\bDO\b/i.test(JSON.stringify(payload));



  const cloudflareGoldenPath = touchesCloudflare

    ? await fetchCloudflareGoldenPath(agent, typeof payload === "string" ? payload : JSON.stringify(payload).slice(0, 1200), tags)

    : null;



  // 3. Run the structured violation extractor with BOTH context sources

  const violations = await agent.ai.generateStructuredResponse(

    [

      `Evaluate this ${type} against golden paths:`,

      JSON.stringify(payload),

      ``,

      `Project golden paths (Edigraph semantic memory):`,

      edigraphCtx.semantic.map((s) => s.fact).join("\n"),

      cloudflareGoldenPath ? `\nCloudflare docs golden path (latest):\n${cloudflareGoldenPath}` : "",

    ].join("\n"),

    z.object({

      passes: z.boolean(),

      violations: z.array(z.string()),

      correctionPrompt: z.string().optional(),

    }),

    "You are a strict code reviewer enforcing both project-specific golden paths and the latest Cloudflare Worker documentation patterns. Your verdict is final.",

  );



  // 4. Persist the verdict to episodic memory for continuous learning

  agent.ctx.waitUntil(agent.memory.addEpisodic(

    `Reviewed ${type}: ${violations.passes ? "PASS" : "FAIL"}`,

    { violations: violations.violations, touchedCloudflare: touchesCloudflare },

  ));



  // 5. Post the verdict into the request's ChatRoom so the Engineer and UI see it live

  agent.ctx.waitUntil((async () => {

    const room = await getAgentByName(agent.env.CHAT_ROOM, `request-${requestId}`);

    await (room as any).post(

      "GuardrailAgent",

      violations.passes ? "Golden-path approved" : `Rejected: ${violations.violations.join("; ")}`,

      { type: "guardrail_verdict", verdict: { status: violations.passes ? "approved" : "rejected", violations: violations.violations, correctionPrompt: violations.correctionPrompt } },

    );

  })());



  return violations.passes

    ? { status: "approved" }

    : { status: "rejected", reason: violations.violations.join("; "), correctionPrompt: violations.correctionPrompt };

}

```



### Live subscription mode



The Guardrail opts into live ChatRoom subscription. In `onStart()`, it calls `ChatRoom.subscribe("GuardrailAgent")` for each active request-room it discovers. When it sees a `milestone_update` with `status: 'pending_review'`, it auto-runs `evaluatePayload()` and the resulting `guardrail_verdict` message is picked up by the EngineerAgent (which is also subscribed to the same room) and by the frontend Live Simulator view.



---



## Step 8 — `ResearchAgent` (Librarian)



**Folder**: `src/backend/src/ai/agents/ResearchAgent/`



**Wrangler binding**: `RESEARCH_AGENT` (new).



**Base class**: `AIChatAgent<Env>`.



**Scope boundary**: ResearchAgent does **NOT** own Cloudflare docs lookups. Those moved to `GuardrailAgent/methods/cloudflare-docs.ts` in Step 7. ResearchAgent is for open-ended investigation — web search, GitHub forensics, Discord archaeology, RSS changelog digests. It is a read-only librarian, not a gatekeeper.



**Files**:



| File | Responsibility |

|------|----------------|

| `index.ts` | Class shell, lazy-init AI Provider + tools registry |

| `types.ts` | `ResearchQuery`, `ResearchResult`, `ResearchSource` |

| `health.ts` | `checkResearchHealth(env)` |

| `methods/web-search.ts` | Web search tool wiring |

| `methods/github.ts` | GitHub repo/issues/PRs research via MCP tools |

| `methods/discord.ts` | Wraps existing `DiscordResearchAgent` workflow (no new code — just imports + dispatch) |

| `methods/cloudflare-changelog.ts` | Wraps existing `CloudflareChangelogWorkflow` (RSS digest, not docs lookup) |



**Tools registration** in `index.ts`:



```typescript

import { WEB_SEARCH_TOOLS, GITHUB_TOOLS } from "@/ai/mcp/tools";

// NOTE: CLOUDFLARE_DOCS_TOOLS is intentionally NOT imported here —

// it belongs to GuardrailAgent. ResearchAgent is read-only investigation.

// Discord and changelog are workflows, not inline tools — wrapped via methods.



export class ResearchAgent extends AIChatAgent<Env> {

  private tools = [...WEB_SEARCH_TOOLS, ...GITHUB_TOOLS];



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



## Step 10 — Live Transparency: Milestone Emission Flow Through the ChatRoom Substrate



The entire "Live Simulator" hierarchy diagram on the frontend is powered by messages flowing through a single ChatRoom DO instance keyed by `request-{requestId}`. This section is the definitive spec for how a milestone hops from an agent's internal brain all the way to a colored dot in the frontend hierarchy view.



### 10.1 End-to-end emission sequence (v5 — Option A locked)



> **Lock L3**: There is exactly one D1 write per milestone, and it happens inside `ChatRoom.post()` → `mirrorToD1()`. The Engineer never writes to `chat_room_logs` directly. The DO SQLite write in `sweMilestones` is the durable hot path; the ChatRoom write is the cross-DO/visible path. No dedupe logic, no two-write tradeoff.



```

┌──────────────────────┐

│  EngineerAgent        │

│  method X runs        │

│  (e.g. runFleet)      │

└──────────┬───────────┘

           │ 1. call emitMilestone(requestId, name, status, detail?, sessionId?)

           ▼

┌─────────────────────────────────────────────────────────────────────┐

│  EngineerAgent/methods/milestones.ts :: emitMilestone()              │

│                                                                      │

│  Step A — DO SQLite hot path (synchronous, awaited)                  │

│    await agent.db                                                    │

│      .insert(sweMilestones)                                          │

│      .values({ id, requestId, sessionId, name, status, detail })     │

│      .onConflictDoUpdate({                                           │

│        target: sweMilestones.id,                                     │

│        set: { status, detail, updatedAt: new Date() },               │

│      });                                                             │

│                                                                      │

│  Step B — Fan-out via ChatRoom (non-blocking, ctx.waitUntil)         │

│    agent.ctx.waitUntil((async () => {                                │

│      const room = await getAgentByName(                              │

│        agent.env.CHAT_ROOM,                                          │

│        `request-${requestId}`,                                       │

│      );                                                              │

│      await (room as any).post(                                       │

│        "EngineerAgent",                                              │

│        `${name} → ${status}`,                                        │

│        {                                                             │

│          type: "milestone_update",                                   │

│          milestone: { id, name, status, sessionId, detail,           │

│                       timestamp: Date.now() },                       │

│        },                                                            │

│      );                                                              │

│    })());                                                            │

│                                                                      │

│  Step C — Agents SDK state sync (synchronous, sub-ms)                │

│    agent.setState({ ...agent.state, lastMilestone: { ... } });       │

│                                                                      │

│  ❌ NO direct D1 insert here — Lock L3 forbids it.                   │

└──────────┬──────────────────────────────────────────────────────────┘

           │ Step B's RPC lands here:

           ▼

┌─────────────────────────────────────────────────────────────────────┐

│  ChatRoom DO instance `request-${requestId}` :: post(source, text, m) │

│                                                                      │

│  Step D — broadcast to every connected WS client                     │

│    this.broadcast(JSON.stringify({ user: source, text, metadata, … }))│

│                                                                      │

│  Step E — single D1 write (THE source of truth)                      │

│    await this.mirrorToD1({ type: "message", user: source, text,      │

│                             metadata, timestamp: Date.now() });      │

│    // → INSERT INTO chat_room_logs (id, room_id, user_name,          │

│    //                               message_type, content,           │

│    //                               metadata_json, timestamp) VALUES …│

└──────────┬──────────────────────────────────────────────────────────┘

           │ broadcast() reaches every subscriber:

           ▼

┌─────────────────────────────────────────────────────────────────────┐

│  Subscribers of `request-${requestId}`                                │

│                                                                      │

│  1. OrchestratorAgent (server-side, subscribed in onStart)           │

│       → OrchestratorAgent/methods/subscribe-rooms.ts handler         │

│       → auto-answers Jules questions, halts on rejected verdicts,    │

│         approves plan:ready milestones, fires onTaskComplete on      │

│         fleet:merge complete                                         │

│                                                                      │

│  2. GuardrailAgent (server-side, subscribed in onStart)              │

│       → GuardrailAgent/methods/subscribe.ts handler                  │

│       → on metadata.type === 'milestone_update' AND                  │

│         status === 'pending_review':                                 │

│           const verdict = await evaluatePayload(...);                │

│           await room.post('GuardrailAgent', …, {                     │

│             type: 'guardrail_verdict', verdict });                   │

│                                                                      │

│  3. Frontend useOrchestratorStatus(requestId)                        │

│       → ingest(msg) dispatches by metadata.type:                     │

│           milestone_update  → upsert hierarchy node                  │

│           guardrail_verdict → overlay badge                          │

│           orchestrator_action → sprint banner                        │

│           jules_event       → Jules sub-card                         │

│           stitch_iteration  → Stitch loop panel                      │

│           (none)            → plain chat log                         │

└─────────────────────────────────────────────────────────────────────┘

```



### 10.2 Why one write (Lock L3 rationale)



`ChatRoom.post()` already calls `mirrorToD1()` for every message (existing behavior). If `EngineerAgent.emitMilestone` ALSO wrote to `chat_room_logs`, every milestone would produce two D1 rows — requiring an idempotent dedupe by `id` and doubling write quota usage.



Option A (the locked answer) accepts a narrow eviction-window risk: if the ChatRoom DO is evicted between Step D's broadcast and Step E's `mirrorToD1` call, the D1 row is lost — but the milestone still exists in `sweMilestones` (DO SQLite), so the next `chatRoom.tail()` call rebuilds it. Integration test #3 in the Verification Plan covers this round-trip.



**Forbidden patterns** (CI grep can enforce):



```bash

# Must produce zero matches in EngineerAgent/methods/milestones.ts:

grep -n "chatRoomLogs" src/backend/src/ai/agents/EngineerAgent/methods/milestones.ts

grep -n "db.insert(chatRoomLogs)" src/backend/src/ai/agents/EngineerAgent/

```



### 10.3 WebSocket endpoint — uses Agents SDK built-in routing



No new route file. The frontend connects to the ChatRoom DO using the Agents SDK's native endpoint:



```

wss://{worker-host}/agents/chat-room/request-{requestId}

```



The `routeAgentRequest` helper in `src/backend/src/index.ts` already handles the `chat-room` prefix once the wrangler binding is `CHAT_ROOM` pointing to `ChatRoom`. This is the same endpoint existing `ChatRoomsList` already uses.



### 10.4 Frontend filtering



`useOrchestratorStatus(requestId)` connects via `useAgent({ agent: "chat-room", name: \`request-${requestId}\` })` and dispatches incoming messages by `metadata.type`:



| `metadata.type` | Target component |

|-----------------|------------------|

| `milestone_update` | Hierarchy diagram node (colored dot) |

| `guardrail_verdict` | Overlay badge on the related milestone + verdict panel |

| `orchestrator_action` | Sprint-level banner in the header |

| `jules_event` | Jules-session nested card |

| `stitch_iteration` | Stitch sub-loop panel |

| _(none)_ | Plain chat log tab |



### 10.5 First-render hydration (snapshot before stream)



On mount, before the WebSocket catches up, `useOrchestratorStatus` calls `chatRoom.tail(200)` via the Agents SDK callable RPC. This returns the last 200 messages from DO SQLite so the hierarchy renders fully populated even for sessions that started minutes ago.



---



## Step 10b — API, WebSocket, and Frontend Routing Consolidation (MMoE-Only)



Every REST route, every WebSocket endpoint, and every frontend hook must point exclusively at the four MMoE agents. No new code ever touches `SOFTWARE_ENGINEER_AGENT`, `STITCH_DESIGN_AGENT`, `JUDGE_AGENT`, `SANDBOX_AGENT`, or any of the legacy `TopicOrchestrator` / `Planner` / `Supervisor` bindings.



### 10b.1 REST route table (post-consolidation)



| Route prefix | Target binding | Purpose |

|---|---|---|

| `POST /api/orchestrator/requests` | `ORCHESTRATOR_AGENT` | Top-level submit — creates `request-{id}` and calls `submitRequest` |

| `GET  /api/orchestrator/requests/:id` | `ORCHESTRATOR_AGENT` | Snapshot of milestones via `getStatus` |

| `POST /api/engineer/:requestId/advance` | `ENGINEER_AGENT` | Manual nudge (debug only) |

| `POST /api/guardrail/:requestId/evaluate` | `GUARDRAIL_AGENT` | Ad-hoc golden-path check from the UI |

| `POST /api/research/:roomId/query` | `RESEARCH_AGENT` | Open-ended research question |

| `GET  /api/chat-rooms/:roomId/tail` | `CHAT_ROOM` (via RPC) | Snapshot read used by Live Simulator first render |

| `GET  /api/chat-rooms/active` | D1 `chat_room_logs` | List of active rooms (powers `ChatRoomsList`) |



Every existing legacy route that still hits `SOFTWARE_ENGINEER_AGENT` (agent-planning, sentinel, sandbox, babysitter) gets rewritten to hit `ENGINEER_AGENT` in Phase B, then deleted in Phase C if redundant.



### 10b.2 WebSocket endpoint table



| Endpoint | Backing binding | Used by |

|---|---|---|

| `wss://…/agents/chat-room/{roomId}` | `CHAT_ROOM` | Live Simulator (primary), ChatRoomsList, any client UI |

| `wss://…/agents/orchestrator-agent/{name}` | `ORCHESTRATOR_AGENT` | `assistant-ui` chat with the Orchestrator (Vercel AI SDK Data Stream) |

| `wss://…/agents/guardrail-agent/{name}` | `GUARDRAIL_AGENT` | Ad-hoc golden-path review UI |

| `wss://…/agents/research-agent/{name}` | `RESEARCH_AGENT` | Research chat UI |



`EngineerAgent` deliberately has no direct UI WebSocket — all Engineer events reach the UI through the ChatRoom substrate.



### 10b.3 Frontend hookup changes (Live Simulator wiring)



The "Live Simulator" is the real-time hierarchy diagram in `OrchestratorStatusView.tsx`. It has three data pipes, all going through the MMoE surface:



| Pipe | Hook | Binding | Purpose |

|---|---|---|---|

| Milestone stream | `useOrchestratorStatus(requestId)` | `CHAT_ROOM` via `useAgent({ agent: "chat-room", name: \`request-${requestId}\` })` | Real-time milestone dots, guardrail verdicts, stitch iterations |

| Orchestrator chat | `useOrchestratorRuntime()` (new, wraps existing `useAgentRuntime`) | `ORCHESTRATOR_AGENT` via `useAgent({ agent: "orchestrator-agent", name: "global" })` | Assistant-UI chat where the user talks to the Orchestrator |

| Snapshot hydration | Direct `agent.tail(200)` RPC call on first mount | `CHAT_ROOM` | Populates hierarchy before WS catches up |



Existing frontend hooks that must be rewired:



| File | Current target | New target |

|---|---|---|

| `src/frontend/src/views/control/global/useAgentRuntime.ts` | Generic agent runtime helper — needs a named variant `useOrchestratorRuntime` | `ORCHESTRATOR_AGENT` |

| `src/frontend/src/views/control/global/Chat.tsx` | Currently talks to the old orchestrator/planner | `ORCHESTRATOR_AGENT` |

| `src/frontend/src/views/research/DeepResearchChatPage.tsx` | Talks to legacy `DEEP_RESEARCH_CHAT` | `RESEARCH_AGENT` |

| `src/frontend/src/views/control/global/ReverseEngineering.tsx` | Legacy RE agent | `RESEARCH_AGENT` (with `methods/reverse-engineering.ts`) OR kept out of scope — decide in Phase A |

| `src/frontend/src/views/control/global/ChatRoomsList.tsx` | Already uses `/api/agent-planning/rooms/active` | `/api/chat-rooms/active` |

| `src/frontend/src/views/repos/EmbeddedChatRoom.tsx` | Already renamed file — just needs the endpoint swap | `/agents/chat-room/{roomId}` |

| (new) `src/frontend/src/views/repos/OrchestratorStatusView.tsx` | — | Live Simulator view wired per 10b.3 above |

| (new) `src/frontend/src/hooks/useOrchestratorStatus.ts` | — | Hook wiring the three pipes |



### 10b.4 Legacy endpoint deprecation



Every legacy endpoint under `/api/planning/*`, `/api/agent-planning/*`, and `/api/agents/session*` gets a single-release-cycle alias that 302-redirects (or RPC-bridges) to the new `/api/orchestrator/*` or `/api/chat-rooms/*` equivalent. In Phase C they are deleted.



---



## Step 11 — Frontend "Live Simulator" Status Page



**New file**: `src/frontend/src/views/repos/OrchestratorStatusView.tsx` (the Live Simulator)



**New hook**: `src/frontend/src/hooks/useOrchestratorStatus.ts`



```typescript

import { useAgent } from "agents/react";

import { useEffect, useState } from "react";

import type { ChatRoom } from "@backend/ai/agents/ChatRoom"; // type-only

import type { MilestoneEvent } from "@backend/ai/agents/EngineerAgent/types";



type Verdict = { status: "approved" | "rejected"; violations?: string[]; correctionPrompt?: string };

type Message = { user: string; text?: string; timestamp: number; metadata?: any };



export function useOrchestratorStatus(requestId: string) {

  const [milestones, setMilestones] = useState<MilestoneEvent[]>([]);

  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  const [chatLog, setChatLog] = useState<Message[]>([]);

  const [hydrated, setHydrated] = useState(false);



  // Connect to the request-scoped ChatRoom DO using Agents SDK routing

  const room = useAgent<ChatRoom>({

    agent: "chat-room",

    name: `request-${requestId}`,

  });



  // First-render snapshot hydration from DO SQLite (Step 10.5)

  useEffect(() => {

    (async () => {

      const snapshot: Message[] = await (room as any).tail(200);

      for (const msg of snapshot) ingest(msg);

      setHydrated(true);

    })();

  }, [room]);



  // Real-time WS stream — same dispatcher as hydration

  useEffect(() => {

    return room.onMessage((raw) => ingest(JSON.parse(raw)));

  }, [room]);



  function ingest(msg: Message) {

    const type = msg.metadata?.type;

    if (type === "milestone_update") {

      setMilestones((prev) => upsert(prev, msg.metadata.milestone));

    } else if (type === "guardrail_verdict") {

      setVerdicts((prev) => ({ ...prev, [msg.metadata.verdict.milestoneId ?? "latest"]: msg.metadata.verdict }));

    } else {

      setChatLog((prev) => [...prev, msg]);

    }

  }



  return { milestones, verdicts, chatLog, hydrated };

}



function upsert(list: MilestoneEvent[], next: MilestoneEvent): MilestoneEvent[] {

  const i = list.findIndex((m) => m.id === next.id);

  if (i < 0) return [...list, next];

  const copy = [...list];

  copy[i] = next;

  return copy;

}

```



The `OrchestratorStatusView.tsx` renders the hierarchy diagram (see 11.2 below) and additionally embeds an `assistant-ui` chat pane wired via a second hook `useOrchestratorRuntime()` that connects to `ORCHESTRATOR_AGENT` via `useAgent({ agent: "orchestrator-agent", name: "global" })`. That chat pane is where the user talks to the Orchestrator while watching the Live Simulator on the left.



### 11.2 Visual hierarchy (rendered by `OrchestratorStatusView.tsx` = the Live Simulator)



```

                  ┌──────────────────┐

                  │  OrchestratorAgent  │

                  └────────┬─────────┘

                           │ assignSprint() RPC

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

                          │ subscribed to ChatRoom `request-{requestId}`

                ┌─────────┴─────────┐

                │  GuardrailAgent   │

                │  (Edigraph +       │

                │   Cloudflare docs) │

                └───────────────────┘

```



All four agents + the frontend all subscribe to the same ChatRoom DO instance `request-{requestId}`. Every dot on the diagram is a `milestone_update` message. Every amber overlay is a `guardrail_verdict` message. Every blue flash at the top is an `orchestrator_action` message.



Status colors:

- `staged` = grey

- `in_progress` = pulsing blue

- `pending_review` = amber

- `blocked` = red

- `complete` = green

- `failed` = red X



Verdict overlays:

- `approved` → small green checkmark on the milestone dot

- `rejected` → small red exclamation on the milestone dot + tooltip with the correction prompt



**Route**: Add `/repos/:owner/:repo/projects/:requestId/live-simulator` to `src/frontend/src/routes/RepoRoutes.tsx`. (Keep `/orchestration` as an alias for one release.)



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



1. **Step 1a** — Fix both broken `@/ai/agents/honi` imports (`standards.ts`, `workflows/research/discord.ts`).

2. **Step 1b** — Purge all 24 `HoniClient` importers. `pnpm run check` must be green before moving on.

3. Create `src/backend/src/db/schemas/agents/software/stateful.ts`.

4. Generate D1 migration for `chat_room_logs` rename.

5. Extend `ChatRoom.ts` with `@callable() post()`, `tail()`, `subscribe()` methods (Step 3h).

6. Create the four new agent folders with full implementations (Steps 5–8). Note: `cloudflare-docs.ts` lives under `GuardrailAgent`, not `ResearchAgent`.

7. Add new wrangler bindings.

8. Add new health checks.

9. Add new frontend Live Simulator route + hook + view.



After Phase A, both old and new agents exist. Run `pnpm run check` and `pnpm run dry-run` — must be green.



### Phase B (Switchover) — migrate every importer (Lock L5: Zero-Downtime Routing)



1. Update routes that call legacy `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT`. Affected files (verified):

   - `src/backend/src/routes/api/agent-planning.ts`

   - `src/backend/src/routes/api/projects/sentinel/*`

   - `src/backend/src/routes/api/sandbox.ts`

   - `src/backend/src/services/planning/babysitter.ts`

2. Stand up the new MMoE REST routes per Step 10b.1 (`/api/orchestrator/*`, `/api/guardrail/*`, `/api/research/*`, `/api/chat-rooms/*`).

3. **Install zero-downtime bridges** (see Phase B.3 detail below) — every legacy path keeps working for one release cycle.

4. Update frontend WS connections from `/api/planning/*` to `/agents/chat-room/request-{requestId}` via the Agents SDK `useAgent` hook.

5. Rewire the frontend hooks listed in Step 10b.3 (`Chat.tsx`, `useAgentRuntime.ts`, `DeepResearchChatPage.tsx`, etc.) to the `agent: "chat-room"` pattern with dynamic room naming.

6. Update `agentStateMirror` writes to use `agentType: 'Engineer'` (not `SoftwareEngineer`).

7. Run integration tests against the new bindings.



#### Phase B.3 — Zero-downtime bridge spec (Lock L5)



Every legacy endpoint MUST continue to function for one release cycle after Phase B ships, so any in-flight client (a stale browser tab, a CLI script, a webhook caller) does not break. The bridge layer is implemented in two ways:



**Bridge type 1: RPC bridge (preferred for routes that take/return JSON)**



The legacy route handler is rewritten to call the new route's handler internally and return its response, with no HTTP redirect involved. This is the preferred approach because it avoids the round-trip and lets request bodies/headers/auth flow through unchanged.



```typescript

// Example: src/backend/src/routes/api/planning.ts (legacy)

import orchestratorApp from "@/routes/api/orchestrator";



app.post("/", async (c) => {

  // Bridge: forward to /api/orchestrator/requests

  const forwarded = new Request(

    new URL("/api/orchestrator/requests", c.req.url),

    { method: "POST", headers: c.req.raw.headers, body: c.req.raw.body },

  );

  return orchestratorApp.fetch(forwarded, c.env, c.executionCtx);

});

```



**Bridge type 2: 302 redirect (fallback, for GET-only or external-facing routes)**



```typescript

app.get("/:id/plan", (c) => c.redirect(`/api/chat-rooms/request-${c.req.param("id")}/tail`, 302));

```



**Locked legacy → MMoE bridge mapping** (every entry MUST be in the codebase before Phase B is considered done):



| Legacy path | Method | Bridge type | New target |

|---|---|---|---|

| `/api/planning/` | POST | RPC | `/api/orchestrator/requests` |

| `/api/planning/:id` | GET | RPC | `/api/orchestrator/requests/:id` |

| `/api/planning/:id/events` | GET | RPC | `/api/chat-rooms/request-:id/tail` |

| `/api/planning/:id/artifacts` | GET | RPC | `/api/orchestrator/requests/:id/artifacts` |

| `/api/planning/:id/plan` | GET | 302 | `/api/orchestrator/requests/:id/plan` |

| `/api/planning/:id/plan.md` | GET | 302 | `/api/orchestrator/requests/:id/plan.md` |

| `/api/planning/:id/download` | GET | 302 | `/api/orchestrator/requests/:id/download` |

| `/api/planning/:id/approve` | POST | RPC | `/api/orchestrator/requests/:id/approve` |

| `/api/planning/:id/revise` | POST | RPC | `/api/orchestrator/requests/:id/revise` |

| `/api/planning/:id/reject` | POST | RPC | `/api/orchestrator/requests/:id/reject` |

| `/api/planning/:id/orchestrate` | POST | RPC | `/api/orchestrator/requests/:id/orchestrate` |

| `/api/planning/:id/implement` | POST | RPC | `/api/orchestrator/requests/:id/implement` |

| `/api/planning/:id/ws` | WS upgrade | RPC | `/agents/chat-room/request-:id` |

| `/api/agent-planning/rooms/active` | GET | RPC | `/api/chat-rooms/active` |

| `/api/agent-planning/*` | * | RPC | `/api/chat-rooms/*` |

| `/api/agents/session` | POST | RPC | `/api/orchestrator/requests` |

| `/api/agents/session/:id` | GET | RPC | `/api/orchestrator/requests/:id` |

| `/api/agents/sessionStatus/:id` | GET | RPC | `/api/orchestrator/requests/:id` |

| `/api/agents/session*` | * | RPC | `/api/orchestrator/requests*` |



**Frontend `useAgent` hook migration** (Lock L5 second clause): every existing `useAgent` call in the frontend that connects to `planning-room`, `software-engineer-agent`, or any of the legacy bindings is rewritten to:



```typescript

useAgent<ChatRoom>({

  agent: "chat-room",

  name: `${prefix}-${id}`,        // 'request-abc', 'epic-xyz', 'task-123', etc.

});

```



The `prefix-{id}` naming is enforced by a thin helper:



```typescript

// src/frontend/src/lib/chat-room-id.ts

export type ChatRoomPrefix = "request" | "epic" | "task" | "sprint" | "session" | "review";

export function chatRoomId(prefix: ChatRoomPrefix, id: string): string {

  return `${prefix}-${id}`;

}

```



Every `useAgent` call site must import and use `chatRoomId(prefix, id)` rather than constructing the room name inline. A lint rule (or grep in CI) enforces zero bare-id rooms.



### Phase C (Destructive cleanup) — delete legacy files



Only after Phase B is verified:



1. Delete every file in the "Files to delete" table above.

2. Remove legacy wrangler bindings (`SOFTWARE_ENGINEER_AGENT`, `STITCH_DESIGN_AGENT`, `JUDGE_AGENT`, etc.).

3. Add a destructive `delete_classes` migration in wrangler to free DO storage.

4. Final `pnpm run check`.



---



## Reused (no modification beyond imports)



- `src/backend/src/services/jules/service.ts` — `JulesService.startSession`, `startParallelSessions`, `executeMCPTool('merge_reconciliation', ...)`

- `src/backend/src/ai/providers/clients/openai/agent.ts` — `setupOpenAIAgentClient()`

- `src/backend/src/ai/providers/methods/orchestration.ts` — `rewriteQuestionForMCPImpl()` (now called exclusively from `GuardrailAgent/methods/cloudflare-docs.ts`)

- `src/backend/src/services/golden-path-config.ts` — `buildCodingAgentInstructions()`

- `src/backend/src/ai/mcp/tools/standards.ts` — `makeQueryStandardsTool()` (after Step 1a import fix)

- `src/backend/src/ai/mcp/tools/index.ts` — barrel of MCP tools (GuardrailAgent imports `CLOUDFLARE_DOCS_TOOLS`; ResearchAgent imports `WEB_SEARCH_TOOLS` + `GITHUB_TOOLS`)

- `src/backend/src/ai/agents/support/edigraph-memory.ts` — `EdigraphService` (used by GuardrailAgent)

- `src/backend/src/workflows/research/discord.ts` — DiscordResearch workflow (wrapped by `ResearchAgent/methods/discord.ts`; the workflow file itself gets the Step 1a honi import fix)

- `src/backend/src/workflows/research/cloudflare-changelog.ts` — Changelog workflow (wrapped by `ResearchAgent/methods/cloudflare-changelog.ts`)

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

- Extend `tests/unit/planning.test.ts` to assert `emitMilestone()` writes to **only two sinks** per Lock L3: (1) DO Drizzle `sweMilestones`, (2) ChatRoom RPC. The D1 row appears via `ChatRoom.post()` → `mirrorToD1()`, NOT a direct write from the Engineer. The test should grep the Engineer source to confirm zero `chatRoomLogs` references.

- Add `tests/unit/engineer-agent-fleet.test.ts` — covers fleet split, parallel session creation, merge gate logic.

- Add `tests/unit/guardrail-evaluate.test.ts` — covers Edigraph context fetch + structured violation extraction + `fetchCloudflareGoldenPath` invocation when `tags` include CF infrastructure terms.

- Add `tests/unit/honi-purge.test.ts` — grep-based assertion that no source file contains `HoniClient`, `@utils/honi-client`, or `@/ai/agents/honi`.

- Add `tests/unit/chat-room-id.test.ts` — assert `chatRoomId(prefix, id)` only accepts the six locked prefixes and produces the correct `prefix-{id}` string.



### Integration (manual, against `wrangler dev`)



1. **Honi purge**: `pnpm run check` is green after Step 1a + 1b — zero references to `@utils/honi-client` or `@/ai/agents/honi` remain in the codebase (verify via `grep -r`).

2. **ChatRoom rename**: D1 migration applies cleanly, `chat_room_logs` table exists, old name gone, frontend `ChatRoomsList` still renders.

3. **ChatRoom new callables**: From a test script, call `ChatRoom.post("test", "hi", { type: "smoke" })` then `ChatRoom.tail(10)` and verify the record round-trips through DO SQLite and shows up in D1 `chat_room_logs`.

4. **Universal room IDs**: Mint rooms under three different prefixes (`epic-smoke`, `task-smoke`, `request-smoke`) and verify each is siloed — messages in one do not appear in another.

5. **EngineerAgent solo task**: Submit a single-file task → watch `brain:evaluate`, `brain:enrich-standards`, `jules:session-1` milestones appear in the Live Simulator view.

6. **EngineerAgent fleet task**: Submit a multi-file task that the brain splits → verify DO Drizzle has N rows in `swe_fleet_sessions` → verify D1 `jules_sessions` has matching rows with `session_role='fleet-member'` → verify `fleet:merge` fires after all complete → Orchestrator sees a single `onTaskComplete`.

7. **Eviction recovery**: After fleet starts, restart `wrangler dev` → on next Engineer call, verify `swe_fleet_sessions` rehydrates from D1.

8. **Triangle (full-stack task)**: Submit a feature requiring frontend + backend → verify `stitch:loop-N` milestones interleave with `jules:session-N` → verify both sub-flows complete before `onTaskComplete`.

9. **Guardrail project-path interception**: Force a project-level violation (e.g. forbidden import) → verify `evaluatePayload` returns `rejected` using Edigraph context → verify EngineerAgent emits a `blocked` milestone and revises the prompt.

10. **Guardrail Cloudflare-path interception**: Submit a change that writes to a Durable Object without `ctx.blockConcurrencyWhile` (a known CF anti-pattern) → verify `fetchCloudflareGoldenPath` is called → verify the structured extractor flags the violation → verify the `guardrail_verdict` message lands in the request's ChatRoom with a correction prompt referencing the Cloudflare docs snippet.

11. **Live Simulator — real-time stream**: Navigate to `/repos/{owner}/{repo}/projects/{requestId}/live-simulator` while a sprint is running → confirm Orchestrator at top, Engineer + Stitch sub-loop in middle, Guardrail subscribed annotation, milestone dots color-coded in real time, verdict overlays appear within ~500ms of the Guardrail call.

12. **Live Simulator — snapshot hydration**: Reload the page mid-sprint → confirm the first-render `tail(200)` call populates the hierarchy before the WS connection opens (no blank flash).

13. **ChatRoom subscription**: Connect a second WS client to the same `request-{id}` ChatRoom → verify it sees both chat messages and milestone events.

14. **Orchestrator chat pane**: From the Live Simulator, type a message into the embedded Orchestrator chat pane → verify it hits `ORCHESTRATOR_AGENT` via the `useOrchestratorRuntime` hook and streams back in Vercel AI SDK Data Stream format.

15. **Health checks**: `GET /api/health` shows `orchestration.orchestrator-agent`, `engineer-agent`, `guardrail-agent`, `research-agent` all healthy.



### Phase C verification



11. After legacy deletion, `pnpm run check` is still green.

12. `wrangler dev` boots with no missing-binding warnings.

13. End-to-end smoke test against staging — submit a representative full-stack task, watch all milestones, confirm a single PR is opened.



---



## Locks Resolved by v5 (no more open questions on these)



The five v5 locks at the top of this document close the previously-open questions. For the record:



| Previous question | v5 answer |

|---|---|

| Two-write tradeoff (10.2) | **Lock L3 — Option A.** ChatRoom.post() is the single source of D1 truth. |

| Room ID convention | **Lock L2 — `prefix-{id}`.** Six allowed prefixes: `request-`, `epic-`, `task-`, `sprint-`, `session-`, `review-`. Enforced by `chatRoomId(prefix, id)` helper. |

| HoniClient replacement table timing | **Lock L1 — scratch doc during implementation.** The replacement table lives at `docs/20260407/software_orchestration_ui/v3/honi-replacements.md` and is deleted before merge. The green-build gate is the acceptance criterion, not a pre-built table. |

| Guardrail vs Research ownership of Cloudflare docs | **Lock L4 — Guardrail exclusively.** ResearchAgent does not import `CLOUDFLARE_DOCS_TOOLS` or call `rewriteQuestionForMCPImpl`. |

| Legacy route deprecation | **Lock L5 — RPC bridges (preferred) or 302 redirects (fallback) for one release cycle.** Phase B installs the bridges in Phase B.3. |



## Open Questions Still Requiring User Confirmation



Only a small set of operational questions remain unresolved by the v5 locks. These are the only items that need user input before implementation begins:



1. **Wrangler binding rename**: Is it acceptable to rename `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` (which forces a new SQLite class migration and discards the existing DO storage), or should the new agent reuse the existing binding name to preserve DO storage continuity?

2. **Legacy DO storage**: When deleting `SoftwareEngineerAgent`, do you want to drop its existing DO SQLite contents, or migrate any persisted state forward to the new `EngineerAgent` DO?

3. **`StitchDesignAgent` fate**: The plan absorbs it into `EngineerAgent/methods/stitch-orchestrator.ts`. Confirm there are no external consumers of the standalone Stitch agent that would break.

4. **Phase C timing**: Should Phase C (legacy deletion) ship in the same PR as Phase A+B, or as a follow-up PR after one production cycle to allow rollback?

5. **`assistant-ui` Vercel AI SDK Data Stream**: Confirm the OrchestratorAgent's `onChatMessage` should produce `text-delta` / `tool-call` / `tool-result` parts in the Vercel format (not the legacy custom format the existing PlanningRoom uses).

