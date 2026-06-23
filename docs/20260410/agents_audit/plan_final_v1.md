# Agent Consolidation & Refactoring Plan (Final — Native CF Agents SDK)

## Context & Hard Mandates

The `src/backend/src/ai/agents/` directory currently contains ~43 exported agent classes and ~52 DO/Workflow bindings in `wrangler.jsonc`. Previous refactor attempts left legacy files, empty target directories, and flat-file agents behind. This plan permanently consolidates the system down to ~23 core agents while enforcing strict architectural standards.

### CRITICAL ARCHITECTURAL MANDATES:

1. **NO HONI FRAMEWORK:** The `honidev` framework is strictly forbidden. All agents must be built natively on the Cloudflare Agents SDK (`import { AIChatAgent, Agent } from "agents"` or `"@cloudflare/ai-chat"`).
2. **STRICT MODULARIZATION:** Flat files are no longer allowed. Every agent MUST follow the exact directory structure detailed below.
3. **THE OMNI-AGENT STANDARD:** Every agent in this system must universally support:
   - **AI Chat Interface:** Frontend streaming compatible with `assistant-ui` (via `useAgentChat` / `onChatMessage`).
   - **Extendable RPC:** Expose `@callable` decorators for direct execution from other workers/agents.
   - **Workflow Interop:** Ability to trigger Cloudflare Workflows (`this.env.WORKFLOW_NAME.create()`) and serve as a callback entrypoint.
   - **WebSocket Pub/Sub:** Ability to connect to shared `ChatRoom` Durable Objects to broadcast/listen to orchestrated multi-agent events.
   - **Cron & Alarms:** Use `this.schedule()` to wake up based on specific criteria (WebSocket events, Jules/Stitch SDK streams, or scheduled intervals).

---

## The Omni-Agent Directory Structure

All AI operations MUST use `@/ai/providers` (including Jules and AI Gateway). The structure for every agent must be exactly:

```text
ai/
  agents/
    {AgentName}/
      index.ts      # Single entrypoint. Extends AIChatAgent. Binds `this.env` and `this.logger` (@/lib/logger.ts) in onStart().
      health.ts     # Comprehensive health checks tying into the larger health service.
      types.ts      # Zod schemas, interface definitions, and state types.
      methods/
        {method}.ts # Isolated logic files delegating from @callable or onChatMessage.
```

---

## Phase 1: Honi Eradication & Base Class Setup ✅

> **Status:** Completed. All Honi references eradicated from agents, routes, frontend, system prompts, and comments. `HoniOrchestrator` and `HoniConsultant` deleted and exports removed. `StitchDesignAgent` restructured to Omni-Agent directory format.

### 1a. Audit and Remove Honi References

- ✅ Search for `honi`, `HoniAgent`, `@honi`, `honidev` across the codebase.
- ✅ Remove `honidev` dependencies from `package.json`.
- ✅ Clean up stale comments in headers (e.g., `StitchDesignAgent.ts:1`, `Gemini.ts:4`, `github/PrReviewer.ts:50`).

### 1b. Retrofit Honi-Branded Agents to CF Agents SDK

- ✅ **`reverse-engineering/Orchestrator.ts`**: Deleted — logic absorbed into `OrchestratorAgent/methods/reverse-engineering.ts`.
- ✅ **`reverse-engineering/Consultant.ts`**: Deleted — logic absorbed into `OrchestratorAgent/methods/reverse-engineering.ts`.
- ✅ **`StitchDesignAgent.ts`**: Restructured to `StitchDesignAgent/` directory with `index.ts`, `health.ts`, `types.ts`, and `methods/stitch-tools.ts`.

---

## Phase 2: Agent Absorption

Move logic from scattered flat files into their respective Master Agents, then delete the flat files.

### 2a. Research Pipeline ➡️ ResearchAgent

- **New Methods:** `methods/puppeteer-search.ts`, `methods/evaluate-candidate.ts`, `methods/generate-report.ts`.
- **Route Updates:** Update `TopicResearchWorkflow` (`WEB_SEARCH_AGENT`, `JUDGE_AGENT`, `REPORTING_AGENT` ➡️ `RESEARCH_AGENT`).
- **Delete:** `WebSearch.ts`, `Judge.ts`, `Reporting.ts`.

### 2b. Orchestration Pipeline ➡️ OrchestratorAgent

- **New Methods:** `methods/topic-research.ts`, `methods/plan.ts`, `methods/planning-orchestration.ts`.
- **Route Updates:** `routes/api/frontend/research/research.ts` (`TOPIC_ORCHESTRATOR` ➡️ `ORCHESTRATOR`), `routes/api/planning.ts`, and any chat routes referencing PlannerAgent.
- **Delete:** `TopicOrchestrator.ts`, `Planner.ts`, `planning/Orchestrator.ts`, `planning/Supervisor.ts`, and the `planning/` directory.

### 2c. Health/Monitoring ➡️ OverseerAgent

- **New Methods:** `methods/diagnose.ts`, `methods/supervisor.ts`.
- **Route Updates:** `routes/api/ops/health.ts` (`HEALTH_DIAGNOSTICIAN` ➡️ `JULES_OVERSEER`), `routes/api/ops/ops.ts`.
- **Delete:** `HealthDiagnostician.ts`, `Supervisor.ts`.

---

## Phase 3: Omni-Agent Capability Enforcement

Ensure the remaining Master and Standalone agents adhere to the strict directory structure and Omni-Agent standards.

### Master Agents (Verify & Audit):

- `OrchestratorAgent/`
- `EngineerAgent/` (Formerly SoftwareEngineerAgent)
- `GuardrailAgent/`
- `ResearchAgent/`
- `OverseerAgent/`
- `ContinuousLearningAgent/`

### Standalone Agents (Convert to Directory Structure):

- `ChatRoom` ➡️ `ChatRoom/`
- `CloudflareDocsAgent` ➡️ `CloudflareDocsAgent/`
- `SandboxAgent` ➡️ `SandboxAgent/`
- `StitchDesignAgent` ➡️ `StitchDesignAgent/`
- `StandardizationAgent` ➡️ `StandardizationAgent/`
- `LandingPageAgent` ➡️ `LandingPageAgent/`
- `LearningAgent` ➡️ `LearningAgent/`
- `github/Owner` ➡️ `github/OwnerAgent/`
- `github/Repo` ➡️ `github/RepoAgent/`
- `github/PrReviewer` ➡️ `github/PrReviewer/`
- `workshop/WorkshopAgent` ➡️ `workshop/WorkshopAgent/`
- `workshop/CfAgentsSdk` ➡️ `workshop/CfAgentsSdk/`
- `workshop/UxResearcher` ➡️ `workshop/UxResearcher/`

_For each agent's `index.ts`, ensure:_ `this.env` and `this.logger` initialization in `onStart()`, `onChatMessage` implementation, `@callable()` decorators, Workflow triggers, and `this.schedule()` alarms.

---

## Phase 4: Delete Dead Files & Wrappers

Delete the following thin wrappers, duplicates, and dead code:

- `Gemini.ts`
- `DeepReasoning.ts`
- `retrofit.ts`
- `DeepResearchChat.ts`
- `ContinuousLearningAgent.ts` (The duplicate root-level file)
- `research/DiscordResearch.ts` (and the `research/` directory)
- **Empty Directories:** `master/`, `implementers/`

---

## Phase 5: Route & Wrangler Updates

### 5a. `wrangler.jsonc` Updates

- **Remove 14 deleted/absorbed DO bindings:** `RetrofitAgent`, `GeminiAgent`, `PlannerAgent`, `Supervisor`, `DeepReasoningAgent`, `DiscordResearchAgent`, `TopicOrchestratorAgent`, `WebSearchAgent`, `JudgeAgent`, `ReportingAgent`, `DeepResearchChatAgent`, `HealthDiagnostician`, `PlanningSupervisorAgent`, `PlanningOrchestratorAgent`.
- **Add Missing Binding:** `STITCH_DESIGN_AGENT` ➡️ `StitchDesignAgent`.
- **Rename Honi Bindings:** `HONI_ORCHESTRATOR` ➡️ `REVERSE_ENGINEERING_ORCHESTRATOR`, `HONI_CONSULTANT` ➡️ `REVERSE_ENGINEERING_CONSULTANT`.
- **DO Migration Tag:** Add migration `v6` with `deleted_classes` and `renamed_classes`.

### 5b. TypeScript & Routing

- Ensure `/agents/*` routes hit `routeAgentRequest` for all Omni-Agents.
- Update `exports.ts` to reflect the final ~24 agent exports.
- Run `npx wrangler types` to regenerate `worker-configuration.d.ts`.
- Update `health.ts` utility to remove deleted agents from the `AGENTS_SDK_AGENTS` list.

---

## Phase 6: StitchDesignAgent + Jules MCP Integration

1. Extract shared Stitch SDK tool factories to `StitchDesignAgent/methods/stitch-tools.ts`.
2. Update `StitchDesignAgent/index.ts` for interactive design sessions via direct Stitch SDK.
3. Update `EngineerAgent/methods/stitch-orchestrator.ts` to dispatch `StitchLoopWorkflow`.
4. Ensure Jules MCP (`mcp__jules__*`) provides `generate_stitch_frontend`, `scaffold_frontend`.

---

## Phase 7: Verification

1. **TypeScript:** `tsc --noEmit` passes cleanly.
2. **Orphan Refs:** `grep -r` for all deleted class/binding names returns zero matches in `src/`.
3. **Wrangler:** `npx wrangler deploy --dry-run` validates config successfully.
4. **Health Check:** Every agent's `/api/health/latest` responds to probes.
5. **Directory Audit:** Every agent directory contains `index.ts`, `health.ts`, `types.ts`, and `methods/`.
6. **No Honi:** Zero references to `honi`, `HoniAgent`, or `honidev` exist in the codebase.
7. **Export Count:** `exports.ts` has ~24 entries.
