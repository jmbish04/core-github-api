# Implementation Plan — Unified AIProvider Skill Component

This plan updates the proposed architecture to align with the feedback that skills must be sourced from internal D1/KV/Edigraph infrastructure rather than loaded from remote GitHub repositories on the fly. 

## User Review Required

> [!IMPORTANT]
> The updated approach uses the existing `agentSkills` schema and `skillsApi` backend routes. By utilizing the database directly, the latency of dynamic prompt building is significantly decreased.
> 
> We will implement two skill selection approaches based on the feedback:
> 1. **Backend Agent Hardcoding**: Backend Agents specify exact `skills: ['skill-a', 'skill-b']` names via code variables to maintain minimal token footprint.
> 2. **Dynamic Chat Injection**: The `AIChatAgent` streaming routes will support an incoming array of chosen skill names from the `assistant-ui` frontend, enabling the user (or another orchestrator) to choose relevant skills at runtime based on conversational context.

## Proposed Changes

### 1. AI Provider Layer (The "Single Entry Point")

#### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/providers/types.ts)
- Update `AIOptions` interface to support an explicit array of skills:
  ```ts
  export interface AIOptions {
    ... existing options ...
    skills?: string[]; // Array of skill names to dynamically fetch from D1
  }
  ```

#### [NEW] [skills.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/providers/agent-support/skills.ts)
- Create a `SkillManager` class initialized inside `AIProvider`.
- Expose a `getSkillInstructions(skillNames: string[]): Promise<string>` method that reads the markdown content directly from the `agent_skills` table using `getDb(env.DB)`.

#### [MODIFY] [index.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/providers/index.ts)
- Add the `SkillManager` initialization.
- In core generation methods (`generateText`, `generateStructuredResponse`, `generateTextWithTools`, etc.), intercept the `options.skills` array if present.
- Fetch the combined skill instructions and append them logically to the `systemPrompt` (wrapped in `<skill_context>` blocks).

---

### 2. Backend Agent Cleanup & Hardcoded Focus

#### [MODIFY] [topic-orchestrator.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/agents/ResearchAgent/methods/topic-orchestrator.ts)
- Remove the legacy `buildSkillContext` logic completely.
- Instead, pass `options: { skills: ['plan-writing', 'brainstorming'] }` to `deps.ai.generateStructuredResponse`.

> Note: I will audit other `ResearchAgent`, `EngineerAgent`, and `OrchestratorAgent` methods to replace hardcoded `buildSkillContext` imports with the dynamic `options.skills` interface.

---

### 3. Frontend Chat Agent & UI Options

#### [MODIFY] [chat.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/ai/providers/clients/vercel/chat.ts)
- The stream UI tools and default `systemPrompt` construction will extract `selectedSkills` from the `context` or `messages` if passed by `assistant-ui`.
- Use the unified `SkillManager` to inject those user-chosen skills into the active dialogue model.

#### [DELETE] [skill-fetcher.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/services/octokit/skill-fetcher.ts)
- Remove this file entirely as GitHub HTTP requests for skills during active inference are no longer desired. (Ingestion happens correctly out-of-band via `/api/skills/ingest`).

## Open Questions

- **Frontend Feature Building**: The backend D1 API for managing and importing GitHub skills already exists (`routes/api/skills.ts`). Do you want this PR to also build the UI for the frontend skill management dashboard (NextJS views), or should this PR focus strictly on the `AIProvider` backend wiring mapping down to the D1 schema first?

## Verification Plan

### Automated Tests
- Conduct a dry-run test bypassing live API calls to verify the `generateText` implementation intercepts `options.skills` and correctly queries D1.

### Manual Verification
- Deploy to a preview worker.
- Trigger `OrchestratorAgent.submitBrief` and check Cloudflare logging to confirm it only loaded the 2 explicitly declared skills.
