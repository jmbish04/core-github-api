# Implement Autonomous Vibe Coding Orchestration

## Objective
Integrate a fully autonomous vibe coding orchestration pipeline into `core-github-api` leveraging the `honidev` agent framework, Cloudflare Docs MCP, and the existing `jules` service.

## Execution Phases

### Phase 1: Environment & Configuration
- [ ] Install `honidev` if not present in the workspace.
- [ ] Update `wrangler.jsonc` to declare `VIBE_ORCHESTRATOR_DO` and `JULES_OVERSEER_DO` bindings.
- [ ] Add migration for new Durable Object classes.
- [ ] Configure text module rules in `wrangler.jsonc` to allow importing `.agent/rules/*.md` files at build time for Edge execution.

### Phase 2: Agent Construction
- [ ] Create `backend/src/ai/agents/VibeOrchestrator.ts` using `createAgent`. Equip with CF Docs MCP tool.
- [ ] Create `backend/src/ai/agents/JulesOverseer.ts` using `createAgent`. Equip with GitHub review and merge tools.
- [ ] Ensure both agents utilize D1 episodic memory and route through Cloudflare AI Gateway.

### Phase 3: Jules Dispatcher & Rules Injection
- [ ] Create `backend/src/services/jules/dispatcher.ts`.
- [ ] Implement text module imports to aggregate all rules from `.agent/rules/`.
- [ ] Build the injection logic that prepends these rules to the system prompt before passing the Orchestrator's task to `julesService.execute()`.

### Phase 4: API & Routing
- [ ] Create Zod OpenAPI routes in `backend/src/routes/api/orchestration.ts`.
- [ ] Expose `POST /api/orchestration/vibe` to trigger the orchestrator.
- [ ] Ensure `/openapi.json`, `/swagger`, and `/scalar` reflect the new orchestration endpoints.
