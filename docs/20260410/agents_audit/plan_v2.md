# Agent Consolidation & Refactoring Plan (v2 — Native CF Agents SDK)

## Context

The `src/backend/src/ai/agents/` directory has ~43 exported agent classes and ~52 DO/Workflow bindings in `wrangler.jsonc`. A v3 refactor plan claimed completion but legacy files were never deleted, target directories are empty, and flat-file agents remain. This plan consolidates to ~23 core agents with strict architectural mandates.

### Hard Mandates

1. **NO HONI FRAMEWORK** — `honidev` is forbidden. All agents must extend `AIChatAgent` or `Agent` from `"agents"` / `"@cloudflare/ai-chat"`.
2. **STRICT MODULARIZATION** — No flat files. Every agent follows: `{AgentName}/index.ts`, `health.ts`, `types.ts`, `methods/{method}.ts`
3. **OMNI-AGENT STANDARD** — Every agent supports: AI Chat (assistant-ui), RPC (`@callable`), Workflow interop, WebSocket Pub/Sub (ChatRoom), Cron/Alarms (`this.schedule()`)

---

## Phase 1: Honi Eradication & Base Class Setup

### 1a. Audit and remove all Honi references

- Search for `honi`, `HoniAgent`, `@honi`, `honidev` across entire codebase
- Remove any `honidev` package dependencies from `package.json`
- Current state: No actual Honi imports exist — only stale comments. Clean up:
  - `StitchDesignAgent.ts:1` — header says "Honi agent"
  - `Gemini.ts:4` — "Migrated from honi"
  - `planning/Supervisor.ts:4`, `Planner.ts:4`, `planning/Orchestrator.ts:4`, `Supervisor.ts:4`, `DeepReasoning.ts:4` — all say "Migrated from honi"
  - `github/PrReviewer.ts:50` — returns `"honi-jules-orchestrator"` pattern string
  - `workshop/UxResearcher.ts:100` — returns `"honi-jules-orchestrator"` pattern string
  - `workshop/CfAgentsSdk.ts:82` — references "Honi-compatible agent runtime"

### 1b. Retrofit Honi-named agents to CF Agents SDK

These agents already use the SDK correctly but have Honi naming/branding:
- **`reverse-engineering/Orchestrator.ts`** (HoniOrchestrator) — rename class to `ReverseEngineeringOrchestrator`, move to `reverse-engineering/Orchestrator/` directory structure
- **`reverse-engineering/Consultant.ts`** (HoniConsultant) — rename class to `ReverseEngineeringConsultant`, move to `reverse-engineering/Consultant/` directory structure
- **`StitchDesignAgent.ts`** — already extends `Agent`. Restructure to `StitchDesignAgent/` directory, fix header comment, add wrangler binding

### 1c. Establish Omni-Agent base pattern

Every agent's `index.ts` must:

```typescript
import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { AIProvider } from "@/ai/providers";
import { Logger } from "@/lib/logger";

export class MyAgent extends AIChatAgent<Env, MyState> {
  public ai!: AIProvider;
  public logger!: Logger;

  async onStart() {
    this.ai = new AIProvider(this.env);
    this.logger = new Logger(this.env, "MyAgent");
  }

  // AI Chat — assistant-ui compatible
  async onChatMessage(onFinish) { ... }

  // RPC — @callable() methods delegating to methods/
  @callable() async myMethod(...) { return methods.myMethod(this, ...); }

  // Workflow interop — trigger via this.env.WORKFLOW_NAME.create()
  // Pub/Sub — connect to ChatRoom DOs
  // Alarms — this.schedule() for background streams
}
```

---

## Phase 2: Agent Absorption

### 2a. Research pipeline → ResearchAgent

**New method files:**
- `ResearchAgent/methods/puppeteer-search.ts` — from `WebSearch.ts` (`search(briefId, query)`)
- `ResearchAgent/methods/evaluate-candidate.ts` — from `Judge.ts` (`evaluateCandidate`)
- `ResearchAgent/methods/generate-report.ts` — from `Reporting.ts` (`generateReport`)

**Route updates:**
- `TopicResearchWorkflow` — change `WEB_SEARCH_AGENT`, `JUDGE_AGENT`, `REPORTING_AGENT` → `RESEARCH_AGENT`

**Delete:** `WebSearch.ts`, `Judge.ts`, `Reporting.ts`

### 2b. Orchestration pipeline → OrchestratorAgent

**New method files:**
- `OrchestratorAgent/methods/topic-research.ts` — from `TopicOrchestrator.ts` (`submitBrief`, `createResearchPlan`)
- `OrchestratorAgent/methods/plan.ts` — from `Planner.ts` (`breakdown`, plan chat)
- `OrchestratorAgent/methods/planning-orchestration.ts` — from `planning/Orchestrator.ts` (`orchestrate`, `breakdown`) + `planning/Supervisor.ts` (`materialize`)

**Route updates:**
- `routes/api/frontend/research/research.ts` — `TOPIC_ORCHESTRATOR` → `ORCHESTRATOR`
- `routes/api/planning.ts` — `PLANNING_ORCHESTRATOR_AGENT` → `ORCHESTRATOR`
- Chat routes referencing PlannerAgent → OrchestratorAgent

**Delete:** `TopicOrchestrator.ts`, `Planner.ts`, `planning/Orchestrator.ts`, `planning/Supervisor.ts`, then `planning/` dir

### 2c. Health/monitoring → OverseerAgent

**New method files:**
- `OverseerAgent/methods/diagnose.ts` — from `HealthDiagnostician.ts` (AI diagnostics, Jules fix dispatch)
- `OverseerAgent/methods/supervisor.ts` — from `Supervisor.ts` (terminal monitoring, GitHub health)

**Route updates:**
- `routes/api/ops/health.ts` — `HEALTH_DIAGNOSTICIAN` → `JULES_OVERSEER`
- `routes/api/ops/ops.ts` — update Supervisor references

**Delete:** `HealthDiagnostician.ts`, `Supervisor.ts`

---

## Phase 3: Omni-Agent Capability Enforcement

For EVERY surviving agent, ensure the directory structure and capabilities:

### Master Agents (already modular, need Omni-Agent audit):

| Agent | Has index.ts | Has health.ts | Has types.ts | Has methods/ | Needs Work |
|-------|-------------|---------------|-------------|-------------|------------|
| OrchestratorAgent/ | YES | NO | YES | YES | Add health.ts, onChatMessage, schedule |
| EngineerAgent/ | YES | NO | YES | YES | Add health.ts, onChatMessage audit |
| GuardrailAgent/ | YES | NO | YES | YES | Add health.ts |
| ResearchAgent/ | YES | NO | YES | YES | Add health.ts |
| OverseerAgent/ | YES | NO | YES | YES | Add health.ts |
| ContinuousLearningAgent/ | YES | NO | YES | YES | Add health.ts, migrate to AIChatAgent |

### Standalone agents to convert to directory structure:

| Agent | Current | Target |
|-------|---------|--------|
| ChatRoom.ts | Flat file | `ChatRoom/index.ts` + `health.ts` + `types.ts` + `methods/` |
| CloudflareDocs.ts | Flat file | `CloudflareDocs/index.ts` + `health.ts` + `types.ts` + `methods/` |
| SandboxAgent.ts | Flat file | `SandboxAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| StitchDesignAgent.ts | Flat file | `StitchDesignAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| StandardizationAgent.ts | Flat file | `StandardizationAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| LandingPageAgent.ts | Flat file | `LandingPageAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| LearningAgent.ts | Flat file | `LearningAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| github/Owner.ts | Flat file | `github/OwnerAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| github/Repo.ts | Flat file | `github/RepoAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| github/PrReviewer.ts | Flat file | `github/PrReviewer/index.ts` + `health.ts` + `types.ts` + `methods/` |
| reverse-engineering/Orchestrator.ts | Flat file | `reverse-engineering/Orchestrator/index.ts` + ... (rename class) |
| reverse-engineering/Consultant.ts | Flat file | `reverse-engineering/Consultant/index.ts` + ... (rename class) |
| workshop/WorkshopAgent.ts | Flat file | `workshop/WorkshopAgent/index.ts` + `health.ts` + `types.ts` + `methods/` |
| workshop/CfAgentsSdk.ts | Flat file | `workshop/CfAgentsSdk/index.ts` + `health.ts` + `types.ts` + `methods/` |
| workshop/UxResearcher.ts | Flat file | `workshop/UxResearcher/index.ts` + `health.ts` + `types.ts` + `methods/` |

### For each agent's index.ts, ensure:

- `this.env` and `this.logger` initialized in `onStart()` and passed to method files
- `onChatMessage` implemented for assistant-ui compatibility
- `@callable()` decorators on all methods
- Workflow triggers via `this.env.WORKFLOW_NAME.create()`
- `this.schedule()` alarms for background streams (Jules/Stitch) or timeouts

---

## Phase 4: Route & Wrangler Updates

### 4a. wrangler.jsonc — Remove 14 deleted/absorbed DO bindings:

```json
RetrofitAgent, GeminiAgent, PlannerAgent, Supervisor, DeepReasoningAgent,
DiscordResearchAgent, TopicOrchestratorAgent, WebSearchAgent, JudgeAgent,
ReportingAgent, DeepResearchChatAgent, HealthDiagnostician,
PlanningSupervisorAgent, PlanningOrchestratorAgent
```

### 4b. wrangler.jsonc — Add missing binding:

- `STITCH_DESIGN_AGENT` → `StitchDesignAgent`

### 4c. wrangler.jsonc — Rename Honi bindings:

- `HONI_ORCHESTRATOR` → `REVERSE_ENGINEERING_ORCHESTRATOR` (class: `ReverseEngineeringOrchestrator`)
- `HONI_CONSULTANT` → `REVERSE_ENGINEERING_CONSULTANT` (class: `ReverseEngineeringConsultant`)

### 4d. DO migration tag:

```json
{
  "tag": "v6",
  "deleted_classes": [
    "RetrofitAgent", "GeminiAgent", "PlannerAgent", "Supervisor",
    "DeepReasoningAgent", "DiscordResearchAgent", "TopicOrchestratorAgent",
    "WebSearchAgent", "JudgeAgent", "ReportingAgent", "DeepResearchChatAgent",
    "HealthDiagnostician", "PlanningSupervisorAgent", "PlanningOrchestratorAgent"
  ],
  "renamed_classes": [
    { "from": "HoniOrchestrator", "to": "ReverseEngineeringOrchestrator" },
    { "from": "HoniConsultant", "to": "ReverseEngineeringConsultant" }
  ]
}
```

### 4e. Hono route updates:

- Ensure `/agents/*` catch-all hits `routeAgentRequest` for all Omni-Agents
- Update all route files referencing old binding names

### 4f. Run `npx wrangler types` to regenerate `worker-configuration.d.ts`

---

## Phase 5: Delete dead files & cleanup

### Files to delete:

- `WebSearch.ts`, `Judge.ts`, `Reporting.ts`
- `TopicOrchestrator.ts`, `Planner.ts`
- `planning/Orchestrator.ts`, `planning/Supervisor.ts` + `planning/` dir
- `HealthDiagnostician.ts`, `Supervisor.ts`
- `Gemini.ts`, `DeepReasoning.ts`, `retrofit.ts`
- `DeepResearchChat.ts`
- `ContinuousLearningAgent.ts` (root-level duplicate)
- `research/DiscordResearch.ts` + `research/` dir

### Directories to delete:

- `master/` (empty)
- `implementers/` (empty)
- `planning/`
- `research/`

### Update exports.ts — Final state (~24 exports):

```typescript
OrchestratorAgent, EngineerAgent (as SoftwareEngineerAgent), GuardrailAgent,
ResearchAgent, OverseerAgent, ContinuousLearningAgent, ChatRoom,
CloudflareDocsAgent, SandboxAgent, StitchDesignAgent, StandardizationAgent,
LandingPageAgent, LearningAgent, OwnerAgent, RepoAgent, PrReviewer,
ReverseEngineeringOrchestrator, ReverseEngineeringConsultant, WorkshopAgent,
CfWorkshop_AgentsSdk, UxResearcher, JulesResearchWorkflow,
ContinuousLearningWorkflow
```

---

## Phase 6: StitchDesignAgent + Jules MCP Integration

1. Extract shared Stitch SDK tool factories to `StitchDesignAgent/methods/stitch-tools.ts`
2. `StitchDesignAgent/index.ts` — interactive design sessions (direct Stitch SDK)
3. `EngineerAgent/methods/stitch-orchestrator.ts` — dispatches `StitchLoopWorkflow`
4. Jules MCP (`mcp__jules__*`) provides `generate_stitch_frontend`, `scaffold_frontend`
5. **Collaboration loop**: EngineerAgent → Jules session → Stitch designs → Jules implements → PR

---

## Verification

1. **TypeScript**: `tsc --noEmit` passes
2. **No orphan refs**: `grep -r` for all deleted class/binding names returns zero matches in `src/`
3. **Wrangler**: `npx wrangler deploy --dry-run` validates config
4. **Health**: Every agent's `health.ts` responds to probe
5. **Omni-Agent audit**: Every agent directory has `index.ts`, `health.ts`, `types.ts`, `methods/`
6. **No Honi**: Zero references to `honi`, `HoniAgent`, `honidev` in codebase
7. **Export count**: `exports.ts` has ~24 entries (down from 43)

---

## Critical Files

- `src/backend/src/ai/agents/exports.ts`
- `wrangler.jsonc`
- `src/backend/src/ai/agents/ResearchAgent/index.ts` + `methods/`
- `src/backend/src/ai/agents/OrchestratorAgent/index.ts` + `methods/`
- `src/backend/src/ai/agents/OverseerAgent/index.ts` + `methods/`
- `src/backend/src/ai/agents/StitchDesignAgent.ts` → `StitchDesignAgent/`
- `src/backend/src/ai/agents/reverse-engineering/Orchestrator.ts` → `Orchestrator/`
- `src/backend/src/ai/agents/reverse-engineering/Consultant.ts` → `Consultant/`
- All route files in `src/backend/src/routes/api/`
