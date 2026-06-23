# Agent Audit Report: Architecture & Consolidation

> **Audit Date:** April 2026
> **Scope:** `src/backend/src/ai/agents/`
> **Primary Goal:** Alignment with Cloudflare Agents SDK and `ai/providers` abstraction.

## Executive Summary
The `src/backend/src/ai/agents/` directory currently suffers from significant architectural drift and redundancy. While some agents have partially migrated to the Cloudflare Agents SDK (`extends Agent`), many still rely on legacy `onRequest`/`fetch` routing patterns and direct vendor imports. Most critically, several "Orchestrator" and "Supervisor" personas are duplicated across multiple subdirectories, leading to maintenance fragmentation.

---

## 1. Compliance Checklist Results

| ID | Checklist Item | Status | Key Findings |
|----|----------------|--------|--------------|
| 1 | **SDK Migration** | ⚠️ Partial | Many `extends Agent` classes still use manual `onRequest` handlers instead of RPC-first patterns. |
| 2 | **Provider Abstraction** | ❌ Fail | `Research.ts` and others import directly from vendor paths (e.g., `@/ai/providers/vendors/jules.ts`). |
| 3 | **Imports/Paths** | ❌ Fail | Relative imports (`../../`) still exist in specialized sub-directories. |
| 4 | **Tool Execution** | ⚠️ Partial | In-line tool definitions are inconsistent; should be standardized via `AIProvider` metadata. |
| 5 | **Workflow Integration** | 🛑 CRITICAL FAIL | `Research.ts` contains a thread-blocking polling loop for Jules. MUST move to **Cloudflare Workflows**. |
| 6 | **RPC/DO Routing** | ⚠️ Partial | `getAgentByName` is used in `JulesOverseer.ts`, but inconsistent elsewhere. |
| 7 | **HTTP/WebSocket Standard** | ❌ Fail | Agents still mix `Response.json` with RPC. Lack of `routeAgentRequest` in some routers. |
| 8 | **Orchestration** | ❌ Fail | Overlapping `Orchestrator` classes in root, `/planning`, and `/reverse-engineering`. |
| 9 | **Consolidation** | 🛑 CRITICAL FAIL | Multiple `Health*`, `DeepResearch*`, and `Overseer*` agents perform overlapping tasks. |

---

## 2. Redundancy & Fragmentation Map

### The "Orchestrator" Collision
We have three distinct Orchestrator files:
1. `ai/agents/Orchestrator.ts` (Legacy Honi/Root)
2. `ai/agents/planning/Orchestrator.ts` (Clean RPC/Planning-focused)
3. `ai/agents/reverse-engineering/Orchestrator.ts` (Specialized)
*   **Recommendation:** Consolidate into a single **`OrchestratorAgent`** (root) with dynamic persona loading.

### Research Fragment
- `Research.ts` (Main Repo analysis)
- `research/DiscordResearch.ts` (Web-sourced)
- `DeepResearchChat.ts` (Interactive)
*   **Recommendation:** Move to a unified `ResearchAgent` with multi-provider sub-tools.

### Health & Monitoring
- `HealthDiagnostician.ts` (Active Debugging)
- `health.ts` (Likely legacy endpoint logic)
- `JulesOverseer.ts` (Monitoring Jules sessions)
*   **Recommendation:** Consolidate into a unified **`SiteReliabilityAgent`** (Overseer).

---

## 3. Critical Technical Debt: Polling Loops
The current `Research.ts` implementation (Line 230+) uses a `setTimeout` based polling loop to check Jules session results.
```typescript
// 🛑 THIS IS A DURABLE OBJECT VIOLATION
await new Promise((resolve) => setTimeout(resolve, 10000));
```
**Impact:** Thread blocking in Durable Objects can lead to isolation restarts and dropped events if the execution exceeds the 10-second limit.
**Fix:** Offload the Jules session result monitoring to a **Cloudflare Workflow** that pokes the Agent via RPC upon completion.

---

## 4. Proposed Consolidated Architecture

### Base Specialists (Unified Classes)
1.  **`OrchestratorAgent`**: Master planner. Converts high-level goals into task lists for sub-agents.
2.  **`SoftwareEngineerAgent`**: Core implementer. Owns the Jules/Refactor/TDD cycle.
3.  **`ResearchAgent`**: Knowledge gatherer. Owns GitHub research, MCP Docs, and Web search.
4.  **`OverseerAgent`**: The "Manager". Owns Health checks, Jules monitoring, and PR validation.

### Directory Structure Redesign
```text
ai/agents/
├── master/
│   ├── OrchestratorAgent.ts
│   └── OverseerAgent.ts
├── implementers/
│   ├── SoftwareEngineerAgent.ts
│   └── LandingPageAgent.ts
├── context/
│   ├── ResearchAgent.ts
│   └── DocumentationAgent.ts
└── support/
    ├── AgentStateStore.ts
    └── types.ts
```

---

## Next Steps
1.  **Approve Consolidation Plan**: Confirm the "Unified Class" approach over directory-sprawl.
2.  **Phase 2 Execution**: Begin with `Research.ts` -> Workflow refactor (highest risk).
3.  **Standardize Providers**: Rewrite all `ai.generate*` calls to use the new native `jules` + `worker-ai` pipeline.
