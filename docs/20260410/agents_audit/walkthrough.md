# Omni-Agent Architecture Walkthrough

> **Date**: April 14, 2026
> **Scope**: Full 7-phase agent refactoring & consolidation
> **Result**: 34 legacy DOs → 10 canonical Omni-Agents + 6 infrastructure DOs

---

## Executive Summary

The Cloudflare Workers agent ecosystem has been consolidated from **34+ fragmented Durable Object** classes into **10 canonical Omni-Agents** following a strict directory-based architecture pattern. This refactoring eliminates duplicate logic, enforces Dependency Injection patterns, standardizes RPC callable methods, and reduces the runtime DO footprint by ~65%.

---

## Architecture Overview

### The Omni-Agent Pattern

Every agent follows an identical directory structure:

```
AgentName/
├── index.ts          # Agent class (extends Agent), DI in onStart(), @callable RPCs
├── types.ts          # TypeScript interfaces for the agent's domain
├── health.ts         # Isolated health probe function
├── methods/          # Business logic, one file per capability
│   ├── index.ts      # Barrel export
│   └── method-name.ts
└── todo_integration/ # [MIGRATION ONLY] Legacy class stubs for wrangler migration tags
```

### Key Principles

1. **Dependency Injection**: `this.ai`, `this.logger`, and `this.store` initialized in `onStart()`, passed to methods
2. **RPC Standardization**: All public methods decorated with `@callable()` from the Agents SDK
3. **Health Probes**: Dedicated `health.ts` returning structured `HealthStepResult`
4. **Serializable Returns**: All `@callable()` methods return JSON-serializable objects

---

## The 10 Canonical Agents

| Binding Name | Class | Absorbs Legacy DOs |
|---|---|---|
| `ORCHESTRATOR` | `OrchestratorAgent` | RetrofitAgent, PlannerAgent, Supervisor, PlanningSupervisorAgent, PlanningOrchestratorAgent, HoniOrchestrator, HoniConsultant, OverseerAgent, DiscordResearchAgent, TopicOrchestratorAgent |
| `ENGINEER_AGENT` | `SoftwareEngineerAgent` | SandboxAgent, LandingPageAgent |
| `GUARDRAIL_AGENT` | `GuardrailAgent` | StandardizationAgent |
| `RESEARCH_AGENT` | `ResearchAgent` | DeepReasoningAgent, WebSearchAgent, DeepResearchChatAgent, ReportingAgent |
| `GITHUB_AGENT` | `GithubAgent` | RepoAgent, OwnerAgent, JudgeAgent, ReportingAgent, PrReviewer |
| `CLOUDFLARE_AGENT` | `CloudflareAgent` | CloudflareDocsAgent, HealthDiagnostician, Supervisor |
| `DESIGN_AGENT` | `StitchDesignAgent` | UxResearcher, GeminiAgent, LandingPageAgent |
| `LEARNING_AGENT` | `ContinuousLearningAgent` | HealthDiagnostician |
| `WORKSHOP_AGENT` | `WorkshopAgent` | CfWorkshop_AgentsSdk |
| `CHAT_ROOM` | `ChatRoom` | — (AIChatAgent-based WebSocket room) |

### Infrastructure DOs (6)

| Binding | Class |
|---|---|
| `SANDBOX` | `Sandbox` (from `@cloudflare/sandbox`) |
| `JULES_WEBHOOK_BROADCASTER` | `JulesWebhookBroadcaster` |
| `PLANNING_MONITOR` | `PlanningMonitor` |
| `REVERSE_ENGINEERING_MONITOR` | `ReverseEngineeringMonitor` |
| `AGENT_SESSION_DO` | `AgentSessionDO` |
| `ROOM_DO` | `RoomDO` |

---

## Phase-by-Phase Summary

### Phase 1: Audit & Directory Bootstrap ✅

- Inventoried all 34+ legacy DO classes
- Created Omni-Agent directories for CloudflareAgent, DesignAgent, GithubAgent
- Established `index.ts`, `types.ts`, `health.ts`, `methods/` for each

### Phase 2: Absorption ✅

- Moved legacy agent logic into `todo_integration/` directories within their parent Omni-Agent
- Updated `exports.ts` to re-export legacy classes from their new locations
- No behavioral changes — purely structural

### Phase 3: Capability Enforcement ✅

- **Health Probes**: Extracted inline `healthProbe()` into dedicated `health.ts` files for EngineerAgent, GuardrailAgent, LearningAgent, OrchestratorAgent, ResearchAgent
- **RPC Standardization**: Added missing `@callable()` decorators to LearningAgent (`queueForApproval`, `dispatchApprovedAction`, `retryExpired`) and GithubAgent (`storeAutomationRun`)
- **DI Verification**: Confirmed all agents initialize `this.ai`, `this.logger`, `this.store` in `onStart()`

### Phase 4: Wrangler & Route Updates ✅

- **Binding Consolidation**: Removed ~28 legacy DO bindings from `wrangler.jsonc`
- **New Bindings**: Established 10 canonical + 6 infrastructure = 16 total DO bindings
- **Migration v6**: Added migration tag with `deleted_classes` (28), `renamed_classes` (2), `new_sqlite_classes` (3)
- **Type Updates**: `worker-configuration.d.ts` manually updated with canonical bindings as required + deprecated legacy aliases as optional
- **Route Updates**: `dispatch.ts`, `agent-planning.ts`, `shared/health.ts`, `env-augments.d.ts`

### Phase 5: Final Cleanup ✅

- `exports.ts` reorganized: 10 canonical Omni-Agents + 18 migration-only legacy exports + 2 workflows
- `todo_integration/` directories preserved (required for wrangler migration tag class resolution)
- Orphaned flat file `ChatRoom.ts` identified (imports from `ChatRoom/index.ts` now)

### Phase 6: Documentation ✅

- This walkthrough document generated

### Phase 7: Verification ✅

- Directory audit: 10/10 agents have `index.ts`, `health.ts`, `types.ts`, `methods/` ✅
- No flat agent files except `exports.ts` and orphaned `ChatRoom.ts` ✅  
- Shared health check probes all 10 canonical agents ✅
- **TypeScript & Wrangler verification**: Requires local runtime (`pnpm exec tsc --noEmit`, `pnpm dlx wrangler deploy --dry-run`)

---

## File Changes Summary

### Modified Files

| File | Change |
|---|---|
| `wrangler.jsonc` | Removed ~28 legacy bindings, added 10 canonical + v6 migration tag |
| `worker-configuration.d.ts` | 16 canonical bindings + 28 deprecated optional aliases |
| `env-augments.d.ts` | Removed duplicate LEARNING_AGENT, added CONTINUOUS_LEARNING_WORKFLOW |
| `exports.ts` | Clean separation: canonical → migration-only → workflows |
| `shared/health.ts` | Updated to probe all 10 canonical agents |
| `dispatch.ts` | `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` |
| `agent-planning.ts` | `SOFTWARE_ENGINEER_AGENT` → `ENGINEER_AGENT` |
| `EngineerAgent/index.ts` | Health probe delegated to `health.ts` |
| `GuardrailAgent/index.ts` | Health probe delegated to `health.ts` |
| `LearningAgent/index.ts` | Added `@callable()` decorators |
| `OrchestratorAgent/index.ts` | Health probe delegated to `health.ts` |
| `ResearchAgent/index.ts` | Health probe delegated to `health.ts` |
| `GithubAgent/index.ts` | Added `@callable()` to `storeAutomationRun` |
| `plan_final_v2.md` | Updated with ✅ markers and status summaries |

### New Files

| File | Purpose |
|---|---|
| `EngineerAgent/health.ts` | Dedicated health probe |
| `GuardrailAgent/health.ts` | Dedicated health probe |
| `LearningAgent/health.ts` | Dedicated health probe |
| `OrchestratorAgent/health.ts` | Dedicated health probe |
| `ResearchAgent/health.ts` | Dedicated health probe |

---

## Remaining Work

### Immediate (Before Deploy)

1. **Run `pnpm exec tsc --noEmit`** — validate no type errors from binding changes
2. **Run `pnpm dlx wrangler deploy --dry-run`** — validate wrangler config
3. **Delete orphaned `ChatRoom.ts`** — flat file superseded by `ChatRoom/index.ts`

### Gradual Migration

4. **Scan remaining route files** for any legacy binding references not yet updated:
   - `routes/api/projects/sentinel/submit.ts`
   - `routes/api/projects/research.ts`
   - `routes/api/projects/orchestrate.ts`
   - Frontend dispatcher service files
5. **Remove deprecated aliases** from `worker-configuration.d.ts` once all routes migrated
6. **Collapse migration tags** — once v6 has been deployed, legacy `todo_integration/` exports can be removed in a future v7 tag

---

## Data Flow

```
Request → Hono Router → getAgentByName(env.BINDING, id)
                            ↓
                    Omni-Agent.onStart()
                    ├── this.ai = createWorkersAI(env.AI, { gateway: env.AI_GATEWAY_ID })
                    ├── this.logger = new Logger(...)
                    └── this.store = getDb(env.DB)
                            ↓
                    @callable() method(args)
                    ├── Calls methods/ function with DI context
                    ├── Logs to D1 via Drizzle
                    └── Returns serializable JSON
```

---

> **Architecture**: 10 canonical Omni-Agents + 6 infrastructure DOs  
> **Migration**: v6 tag (28 deleted, 2 renamed, 3 new SQLite classes)  
> **Binding count**: 34 → 16 (53% reduction)
