### Prompt for Your Coding Agent

You can copy and paste this directly to your coding agent to initiate the implementation:

```text
Please execute the comprehensive agent refactoring and consolidation plan located at `docs/20260410/agents_audit/plan_final.md`. 

As you progress through the plan:
1. Update `plan_final.md` by adding green emoji checkmarks (✅) next to each discrete task as it is completed.
2. Under each Phase header in `plan_final.md`, add a brief markdown blockquote callout (e.g., `> **Status:** Completed...`) summarizing exactly what was accomplished for that section.
3. Strictly adhere to the "Hard Mandates" defined in the plan, particularly ensuring all agents are converted to the "Omni-Agent" directory structure and utilize the native Cloudflare Agents SDK.
4. Once all 7 phases are fully executed and verified, generate a comprehensive walkthrough document detailing the new architecture, file structures, and data flows. Save this file to `docs/20260410/agents_audit/walkthrough.md`.

Let's begin with Phase 1. Provide me with the code changes and shell commands needed to execute the first phase.
```

***

### Antigravity Implementation Plan

```markdown
# Antigravity Implementation Plan

## `.agent/workflows/implement-feature.md`
```markdown
# Workflow: Agent Consolidation & Refactoring (Final)

**Objective:** Consolidate ~43 exported agents down to ~23 core agents natively utilizing the Cloudflare Agents SDK. Eradicate Honi framework dependencies and enforce the strict Omni-Agent directory structure.

**Execution Steps:**
1.  **Phase 1 (Honi Eradication):** Remove `honidev` references and retrofit `StitchDesignAgent`, `ReverseEngineeringOrchestrator`, and `ReverseEngineeringConsultant` to use `@cloudflare/ai-chat`.
2.  **Phase 2 (Absorption):** Move methods from `WebSearch`, `Judge`, `Reporting` into `ResearchAgent`. Move planning agents into `OrchestratorAgent`. Move health agents into `OverseerAgent`. Delete the old flat files.
3.  **Phase 3 (Directory Structure):** Restructure all remaining standalone agents into the `{AgentName}/index.ts`, `health.ts`, `types.ts`, `methods/` format. Ensure `onStart` binds `this.env` and `this.logger`.
4.  **Phase 4 (Cleanup):** Delete thin wrappers (`Gemini.ts`, `DeepReasoning.ts`, `retrofit.ts`, `DeepResearchChat.ts`, `DiscordResearch.ts`) and empty directories.
5.  **Phase 5 (Config Updates):** Update `wrangler.jsonc` with new bindings and the `v6` DO migration tag for deleted classes. Regenerate types. Update `exports.ts`.
6.  **Phase 6 (Integration):** Extract Stitch SDK tool factories to `StitchDesignAgent/methods/stitch-tools.ts` and wire up the EngineerAgent/Jules collaboration loop.
7.  **Documentation (Agent Action):** Dynamically update `docs/20260410/agents_audit/plan_final.md` with ✅ and summary callouts. Upon completion, generate `docs/20260410/agents_audit/walkthrough.md`.
```

## `.agent/rules/agent-consolidation-rules.md`
```markdown
# Rules: Agent Consolidation

- **Framework Ban:** Never import or use `honi`, `HoniAgent`, or `honidev`. All agents MUST use `import { AIChatAgent } from "@cloudflare/ai-chat"` or `import { Agent } from "agents"`.
- **Directory Structure Strictness:** An agent is only valid if it is a directory containing exactly `index.ts`, `health.ts`, `types.ts`, and a `methods/` folder. Flat `.ts` files for agents in `src/ai/agents/` are strictly forbidden.
- **Capability Requirements:** Every `index.ts` must instantiate `this.ai` and `this.logger` inside `onStart()`. All specific logic must be decorated with `@callable()` or handled via `onChatMessage` and delegate to files inside the `methods/` directory.
- **Config Sync:** Any time an agent directory is created, deleted, or renamed, `wrangler.jsonc`, `exports.ts`, and Hono route consumers must be updated immediately in the same step.
```