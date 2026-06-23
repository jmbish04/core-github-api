# Rule: Jules Integration Maintenance

## 1. Source of Truth

- The central hub for all Jules interactions is `backend/src/routes/api/agents/jules.ts` and `backend/src/services/jules.ts`.
- **DO NOT** create a new Jules router mapped elsewhere (such as `services/jules.ts`). Ensure `/api/agents/jules` is the canonical invocation endpoint.

## 2. Invoking Jules

- Clients use `/api/agents/jules/start` (or `/invoke`). You must pass `inject_standards: true` (default) to push `JULES_STANDARDS` alongside the prompt.
- **Jobs and Sessions**: `julesSessions` tracks the state returned by `@google/jules-sdk`. `julesJobs` wraps tracking around full repository-bound interactions. Do not query Jules SDK polling functions from the frontend; use `get /api/agents/jules/status/:id` instead.

## 3. Modifying Jules Code

- **CRITICAL**: Anytime a change is made to any Jules related code (e.g., schemas, routes, services, or the sdk version), you MUST:
  1. Update `AGENTS.md` to reflect new patterns or architecture updates if necessary.
  2. Update this `.agent/rules/jules.md` file if any constraints or conventions change.
  3. Ensure the frontend `Docs` page for Jules integration accurately reflects the state of the API.

## 4. Workflows & Autonomy

- Jules SDK runs synchronously within the environment. For detached executions, the user request can trigger `force_overseer: true`, which kicks off a workflow check via the `JulesOverseer` Durable Object Singleton.
