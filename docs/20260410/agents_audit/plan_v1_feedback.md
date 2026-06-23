# Agent Consolidation & Refactoring Plan (v1 - Native CF Agents SDK)

## Context & Hard Mandates
The `src/backend/src/ai/agents/` directory has ~43 exported agent classes and ~52 DO/Workflow bindings in `wrangler.jsonc`. We are consolidating these down to ~23 core agents.

### CRITICAL ARCHITECTURAL MANDATES:
* **NO HONI FRAMEWORK:** The honidev framework is strictly forbidden. All agents must be built natively on the Cloudflare Agents SDK (`import { AIChatAgent, Agent } from "agents"`). Any existing Honi agents (e.g., HoniOrchestrator, HoniConsultant, StitchDesignAgent) must be immediately retrofitted to the native SDK.
* **STRICT MODULARIZATION:** Flat files are no longer allowed. Every agent MUST follow a strict directory structure (detailed below).
* **UNIVERSAL CAPABILITIES:** Every agent in this system is an "Omni-Agent". They must universally support chat, RPC, workflows, pub/sub, and scheduling.

## 1. The Omni-Agent Standard (Required for ALL Agents)
Every agent must implement the following capabilities natively:
* **AI Chat Interface:** Frontend streaming compatible with assistant-ui (via `useAgentChat`).
* **Extendable RPC:** Expose `@callable` methods for direct execution from other workers/agents.
* **Workflow Interop:** Ability to trigger Cloudflare Workflows (`this.env.WORKFLOW_NAME.create()`) and serve as a callback entrypoint.
* **Websocket Pub/Sub:** Ability to connect to shared ChatRoom Durable Objects to broadcast/listen to orchestrated multi-agent events.
* **Cron & Alarms:** Use `this.schedule()` to wake up based on specific criteria (WebSocket events, Jules/Stitch SDK streams, or scheduled intervals).

### Strict Directory Structure
All AI operations MUST use `@/ai/providers` (including Jules and AI Gateway). The structure for every agent must be exactly:
```text
ai/
  agents/
    {AgentName}/
      index.ts      # Single entrypoint. Extends AIChatAgent. Binds `this.env` and `this.logger` (@/lib/logger.ts) for all methods to use.
      health.ts     # Comprehensive health checks that tie into the larger health service.
      types.ts      # Zod schemas, interface definitions, and state types.
      methods/
        {method}.ts # Isolated logic files. All AI calls route through @/ai/providers.
```

## 2. Disposition of Every Agent

### KEEP & REFACTOR (Master Agents - 6 total):
All of these must be retrofitted to the modular Omni-Agent directory structure.
* OrchestratorAgent (OrchestratorAgent/)
* EngineerAgent (EngineerAgent/ - formerly SoftwareEngineerAgent)
* GuardrailAgent (GuardrailAgent/)
* ResearchAgent (ResearchAgent/)
* OverseerAgent (OverseerAgent/)
* ContinuousLearningAgent (ContinuousLearningAgent/)

### KEEP & REFACTOR (Standalone/Pattern Agents - 13 total):
* ChatRoom (ChatRoom/) - WebSocket hub for inter-agent messaging.
* CloudflareDocsAgent (CloudflareDocs/) - Guardrail reference.
* SandboxAgent (SandboxAgent/) - Cloudflare Sandbox SDK manager.
* StitchDesignAgent (StitchDesignAgent/) - MUST REMOVE HONI. Retrofit to CF Agents SDK. Add to wrangler bindings.
* StandardizationAgent (StandardizationAgent/)
* LandingPageAgent (LandingPageAgent/)
* OwnerAgent (github/OwnerAgent/)
* RepoAgent (github/RepoAgent/)
* PrReviewer (github/PrReviewer/)
* ReverseEngineeringOrchestrator (reverse-engineering/Orchestrator/ - REMOVE HONI)
* ReverseEngineeringConsultant (reverse-engineering/Consultant/ - REMOVE HONI)
* WorkshopAgent (workshop/WorkshopAgent/)
* CfWorkshop_AgentsSdk (workshop/CfAgentsSdk/)
* UxResearcher (workshop/UxResearcher/)
* LearningAgent (LearningAgent/) - Distinct from ContinuousLearning; handles HitlWorkflow analysis.

### KEEP (Workflows - 2 total):
* JulesResearchWorkflow (workflows/GithubResearch.ts)
* ContinuousLearningWorkflow (workflows/ContinuousLearning.ts)

### ABSORB & DELETE (Move logic into methods/, then delete flat files - 9 total):
* WebSearch.ts, Judge.ts, Reporting.ts ➡️ Move to ResearchAgent/methods/
* TopicOrchestrator.ts, Planner.ts, planning/Orchestrator.ts, planning/Supervisor.ts ➡️ Move to OrchestratorAgent/methods/
* HealthDiagnostician.ts, Supervisor.ts ➡️ Move to OverseerAgent/methods/

### DELETE (Thin wrappers / dead code / duplicates - 6 total):
* Gemini.ts, DeepReasoning.ts, retrofit.ts, DeepResearchChat.ts, ContinuousLearningAgent.ts (root), research/DiscordResearch.ts

## 3. Implementation Phases

### Phase 1: Honi Eradication & Base Class Setup
* Audit the codebase for honidev imports. Remove all dependencies.
* Rewrite StitchDesignAgent, ReverseEngineeringOrchestrator, and ReverseEngineeringConsultant to extend AIChatAgent from the @cloudflare/ai-chat package.
* Ensure all surviving agents have the index.ts, health.ts, types.ts, and methods/ structure.

### Phase 2: Agent Absorption
* ResearchAgent: Create methods/puppeteer-search.ts, evaluate-candidate.ts, generate-report.ts. Delete WebSearch.ts, Judge.ts, Reporting.ts.
* OrchestratorAgent: Create methods/topic-research.ts, plan.ts, planning-orchestration.ts. Delete overlapping planning agents.
* OverseerAgent: Create methods/diagnose.ts, supervisor.ts. Delete HealthDiagnostician.ts, Supervisor.ts.

### Phase 3: Capability Enforcement (The Omni-Agent Standard)
Edit every index.ts to ensure:
* `this.env` and `this.logger` are initialized in the constructor/setup and passed to method files.
* `onChatMessage` is implemented for assistant-ui compatibility.
* `@callable()` decorators are applied to all methods in methods/ so they can be invoked via RPC.
* Workflows are triggered directly using `this.env.WORKFLOW_NAME.create()`.
* `this.schedule` alarms are registered to listen for background streams (Jules/Stitch) or timeouts.

### Phase 4: Route & Wrangler Updates
* Update wrangler.jsonc to remove the 14 deleted/absorbed agents.
* Add missing bindings (e.g., StitchDesignAgent).
* Update Hono routes to point to the new consolidated Agent DO namespaces.
* Ensure /agents/* routes correctly hit routeAgentRequest for all Omni-Agents.