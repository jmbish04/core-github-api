# Implementation Plan: AI Agent Refactor & Standardization

This plan outlines the systematic refactoring of the `src/backend/src/ai/agents/` directory to eliminate redundancy, ensure compliance with the Cloudflare Agents SDK, and optimize performance via Cloudflare Workflows.

---

## User Review Required

> [!IMPORTANT]
> **Consolidation Impact:** We are merging multiple agent files into "Master Classes" (e.g., `OrchestratorAgent`, `ResearchAgent`). This will change the Durable Object class names in `wrangler.jsonc`.
> 
> **Migration Strategy:** Existing Durable Object state for the old classes will be lost. If persistent state is critical, we must write a migration script to D1 BEFORE deployment. However, most agent state is transient or mirrored in D1 already.

> [!WARNING]
> **Workflow Migration:** The blocking polling logic in `Research.ts` will be moved to a brand new `JulesResearchWorkflow`. This requires new bindings in `wrangler.jsonc`.

---

## Proposed Changes

### Phase 1: Infrastructure & Shared Utilities

#### [MODIFY] [AIProvider.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/providers/index.ts)
- Standardize tool-calling interfaces to support uniform agent execution.

#### [NEW] [JulesResearchWorkflow.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/agents/workflows/JulesResearchWorkflow.ts)
- Implements the `WorkflowEntrypoint` to handle Jules session polling and result extraction.
- Calls the `ResearchAgent` via RPC upon completion.

### Phase 2: Agent Consolidation (The "Master Classes")

#### [NEW] [OrchestratorAgent.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/agents/master/OrchestratorAgent.ts)
- Consolidates root `Orchestrator.ts` and `planning/Orchestrator.ts`.
- Defines `@callable` methods for `plan`, `breakdown`, and `orchestrate`.

#### [NEW] [ResearchAgent.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/agents/context/ResearchAgent.ts)
- Consolidates `Research.ts`, `DeepResearchChat.ts`, and `DiscordResearch.ts`.
- Implements a unified `analyzeRepo` tool that triggers the `JulesResearchWorkflow`.

#### [NEW] [OverseerAgent.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/agents/master/OverseerAgent.ts)
- Consolidates `HealthDiagnostician.ts` and `JulesOverseer.ts`.
- Owns the `checkJulesStatus` monitoring loop and proactive diagnostics.

### Phase 3: Cleanup & Deletion

#### [DELETE] `src/backend/src/ai/agents/Orchestrator.ts`
#### [DELETE] `src/backend/src/ai/agents/planning/*`
#### [DELETE] `src/backend/src/ai/agents/Research.ts`
#### [DELETE] `src/backend/src/ai/agents/DeepResearchChat.ts`
#### [DELETE] `src/backend/src/ai/agents/HealthDiagnostician.ts`

---

## Verification Plan

### Automated Tests
- `npm run test:agents`: Unit tests for the new consolidated classes.
- `wrangler dev`: Verify RPC communication between `OrchestratorAgent` and `ResearchAgent`.

### Manual Verification
- Trigger a Jules Research session and monitor the Cloudflare Dashboard to ensure the **Workflow** handles the polling correctly without blocking the Agent thread.
- Verify the "Workshop" UI reflects the activity from the new `OverseerAgent`.
