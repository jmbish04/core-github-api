# Agent Consolidation Plan

## Context
The `src/backend/src/ai/agents/` directory has ~43 exported agent classes and ~52 DO/Workflow bindings in `wrangler.jsonc`. A v3 refactor plan (docs/20260407/ai_agent_refactor/) claimed consolidation was complete, but the audit reveals:
- **master/** and **implementers/** directories are EMPTY — agents stayed at root
- Legacy files claimed as deleted (DeepResearchChat.ts, HealthDiagnostician.ts, planning/*, etc.) ALL still exist
- 6 properly consolidated "Master" agents exist but coexist with their overlapping predecessors
- Several thin wrapper agents add no unique value

**Goal:** Consolidate from ~43 agents down to ~23, deleting absorbed/dead agents, updating wrangler.jsonc, exports.ts, and all route consumers.

---

## Disposition of Every Agent

### KEEP (properly consolidated master agents, 6 total):

| Agent | Path | SDK |
|-------|------|-----|
| OrchestratorAgent | `OrchestratorAgent/` | AIChatAgent |
| EngineerAgent (SoftwareEngineerAgent) | `EngineerAgent/` | AIChatAgent |
| GuardrailAgent | `GuardrailAgent/` | AIChatAgent |
| ResearchAgent | `ResearchAgent/` | AIChatAgent |
| OverseerAgent | `OverseerAgent/` | AIChatAgent |
| ContinuousLearningAgent | `ContinuousLearningAgent/` | Agent |

### KEEP (retained patterns per user requirements, 4 total):

| Agent | Path | Notes |
|-------|------|-------|
| ChatRoom | `ChatRoom.ts` | WebSocket hub, inter-agent messaging |
| CloudflareDocsAgent | `CloudflareDocs.ts` | Guardrail reference |
| SandboxAgent | `SandboxAgent.ts` | Cloudflare Sandbox SDK |
| StitchDesignAgent | `StitchDesignAgent.ts` | Stitch SDK tools (fix "Honi" header, add wrangler binding) |

### KEEP (standalone agents with distinct purpose, 9 total):

| Agent | Path | Reason |
|-------|------|--------|
| StandardizationAgent | `StandardizationAgent.ts` | Distinct standards enforcement |
| LandingPageAgent | `LandingPageAgent.ts` | Jules UI dispatch |
| OwnerAgent | `github/Owner.ts` | GitHub webhook infra |
| RepoAgent | `github/Repo.ts` | GitHub webhook infra |
| PrReviewer | `github/PrReviewer.ts` | PR review |
| HoniOrchestrator | `reverse-engineering/Orchestrator.ts` | Active route consumers |
| HoniConsultant | `reverse-engineering/Consultant.ts` | Active route consumers |
| WorkshopAgent | `workshop/WorkshopAgent.ts` | Frontend surface area |
| CfWorkshop_AgentsSdk | `workshop/CfAgentsSdk.ts` | Workshop |
| UxResearcher | `workshop/UxResearcher.ts` | Jules+Stitch pipeline |
| LearningAgent | `LearningAgent.ts` | **Different from ContinuousLearning** — does conversation pattern analysis, used by sentinel ingestor + LearningWorkflow + HitlWorkflow |

### KEEP (workflows, 2 total):

| Workflow | Path |
|----------|------|
| JulesResearchWorkflow | `workflows/GithubResearch.ts` |
| ContinuousLearningWorkflow | `workflows/ContinuousLearning.ts` |

### ABSORB (move logic into master, then delete file, 9 total):

| Agent | Absorb Into | Key Logic to Move |
|-------|-------------|-------------------|
| WebSearch.ts | ResearchAgent | Puppeteer search (`search(briefId, query)`) |
| Judge.ts | ResearchAgent | `evaluateCandidate` scoring |
| Reporting.ts | ResearchAgent | `generateReport` |
| TopicOrchestrator.ts | OrchestratorAgent | `submitBrief`, `createResearchPlan` |
| Planner.ts | OrchestratorAgent | `breakdown`, plan-generation chat |
| planning/Orchestrator.ts | OrchestratorAgent | `orchestrate`, `breakdown` |
| planning/Supervisor.ts | OrchestratorAgent | `materialize` |
| HealthDiagnostician.ts | OverseerAgent | AI diagnostics, Jules fix dispatch |
| Supervisor.ts | OverseerAgent | Terminal monitoring, GitHub health |

### DELETE (thin wrappers / dead code / duplicates, 5 total):

| Agent | Reason |
|-------|--------|
| Gemini.ts | Thin AIProvider wrapper, no unique logic |
| DeepReasoning.ts | Thin `generateText` wrapper |
| retrofit.ts | No route consumers |
| DeepResearchChat.ts | Overlaps ResearchAgent |
| ContinuousLearningAgent.ts (ROOT file) | Duplicate of ContinuousLearningAgent/index.ts |
| research/DiscordResearch.ts | Already subsumed by ResearchAgent |

---

## Implementation Phases

### Phase 1: Absorb research-pipeline agents into ResearchAgent

**Files to modify:**
- `ResearchAgent/methods/` — add `puppeteer-search.ts`, `evaluate-candidate.ts`, `generate-report.ts`
- `ResearchAgent/index.ts` — add `@callable()` methods
- `ResearchAgent/methods/index.ts` — re-export new methods

**Route updates:**
- `TopicResearchWorkflow` (workflows/research/topic.ts) — change `WEB_SEARCH_AGENT`, `JUDGE_AGENT`, `REPORTING_AGENT` to `RESEARCH_AGENT`

**Delete:** `WebSearch.ts`, `Judge.ts`, `Reporting.ts`

### Phase 2: Absorb orchestration agents into OrchestratorAgent

**Files to modify:**
- `OrchestratorAgent/methods/` — add `topic-research.ts`, `plan.ts`, `planning-orchestration.ts`
- `OrchestratorAgent/index.ts` — add `@callable()` methods

**Route updates:**
- `routes/api/frontend/research/research.ts` — `TOPIC_ORCHESTRATOR` -> `ORCHESTRATOR`
- `routes/api/planning.ts` — `PLANNING_ORCHESTRATOR_AGENT` -> `ORCHESTRATOR`
- Any chat routes referencing PlannerAgent

**Delete:** `TopicOrchestrator.ts`, `Planner.ts`, `planning/Orchestrator.ts`, `planning/Supervisor.ts`, then `planning/` dir

### Phase 3: Absorb health/monitoring into OverseerAgent

**Files to modify:**
- `OverseerAgent/methods/` — add `diagnose.ts`, `supervisor.ts`
- `OverseerAgent/index.ts` — add `@callable()` methods

**Route updates:**
- `routes/api/ops/health.ts` — `HEALTH_DIAGNOSTICIAN` -> `JULES_OVERSEER`
- `routes/api/ops/ops.ts` — update Supervisor references

**Delete:** `HealthDiagnostician.ts`, `Supervisor.ts`

### Phase 4: Delete thin wrappers and duplicates

**Delete:** `Gemini.ts`, `DeepReasoning.ts`, `retrofit.ts`, `DeepResearchChat.ts`, `ContinuousLearningAgent.ts` (root), `research/DiscordResearch.ts`

**Route updates:**
- `routes/api/agents/deep-research-chat.ts` — redirect to ResearchAgent
- Any routes referencing GeminiAgent — redirect to OrchestratorAgent chat or generic endpoint

### Phase 5: StitchDesignAgent cleanup

- Fix header comment: "Honi agent" -> "Cloudflare Agent"
- Add wrangler binding: `STITCH_DESIGN_AGENT` -> `StitchDesignAgent`
- Add to `exports.ts`
- Extract shared Stitch SDK tool factories to `support/stitch-tools.ts` for reuse by EngineerAgent's `stitch-orchestrator.ts`

### Phase 6: Update wrangler.jsonc

- Remove DO bindings for 14 deleted agents
- Add `StitchDesignAgent` binding
- Add migration tag (`v6`) with `deleted_classes` for all removed DOs
- Run `npx wrangler types` to regenerate `worker-configuration.d.ts`

### Phase 7: Update exports.ts

Final state: ~24 exports (down from 43)

### Phase 8: Cleanup

- Delete empty directories: `master/`, `implementers/`, `research/`, `planning/`
- Update `health.ts` utility — remove deleted agents from `AGENTS_SDK_AGENTS` list
- `tsc --noEmit` must pass

---

## Verification

1. **TypeScript**: `tsc --noEmit` passes
2. **No orphan refs**: `grep -r "WebSearchAgent\|JudgeAgent\|ReportingAgent\|GeminiAgent\|PlannerAgent\|DeepReasoningAgent\|HealthDiagnostician\|PlanningSupervisor\|PlanningOrchestrator\|TopicOrchestrator\|DeepResearchChat\|DiscordResearch" src/` returns zero matches
3. **Wrangler**: `npx wrangler deploy --dry-run` validates config
4. **Health**: `/api/health/latest` shows all remaining agents healthy
5. **Route smoke tests**: Test updated routes (research create, planning orchestrate, health analyze)
6. **Export count**: `exports.ts` has ~24 entries

---

## StitchDesignAgent + Jules MCP Integration

The Stitch/Jules collaboration pattern:
1. **EngineerAgent** dispatches `StitchLoopWorkflow` for automated multi-page generation
2. **StitchLoopWorkflow** uses `StitchService` + `JulesService` directly
3. **StitchDesignAgent** provides interactive design sessions (direct Stitch SDK tools)
4. **Jules MCP** (`mcp__jules__*`) provides `generate_stitch_frontend`, `scaffold_frontend`
5. **Collaboration loop**: EngineerAgent -> Jules session -> StitchDesignAgent generates UI designs -> Jules implements -> PR created

The Stitch tool factories should be extracted to `support/stitch-tools.ts` so both StitchDesignAgent (interactive) and StitchLoopWorkflow (automated) can share them.
