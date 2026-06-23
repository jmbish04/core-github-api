# Skills D1 Schema, Ingestion API & Frontend UI Implementation

1. **Schema Enhancements**:
   - Create `src/backend/src/db/schemas/agents/allowed_tools.ts` and `skill_references.ts` using `drizzle-orm`. Ensure you are using the existing project syntax (v0.45.1 with `drizzle-zod`), explicitly avoiding v1.0.0+ imports.
   - Export these new tables from `src/backend/src/db/schemas/agents/index.ts`.
   - Run `db:generate:core` and `migrate:local:core` to apply updates to D1.

2. **Hono Ingestion Route**:
   - Update `src/backend/src/routes/api/ops/skills.ts`.
   - Create a new POST `/ingest-structured` route with a Zod schema validating `{ owner, repo, path, branch }`.
   - Implement graceful parsing of `allowed-tools` or `tools` arrays from the downloaded markdown.
   - Batch insert any extracted tools into `agent_skill_allowed_tools` using `db.insert().values([...])`.
   - Integrate the existing `Logger` service for D1 event mirroring.

3. **Frontend UI Update**:
   - Modify `src/frontend/src/components/config/SkillsManager.tsx`.
   - Replace the existing URL string input with a comprehensive grid form targeting the new `/ingest-structured` route. Provide toast/alert feedback upon success or failure.

4. **Agent Orchestrator Refactor**:
   - Edit `src/backend/src/ai/agents/backend/EngineerAgent/methods/stitch-orchestrator.ts`.
   - Insert an AI generation call leveraging `options.skills` into the existing control loop, keeping the established milestone tracking intact.

5. **Rule Documentation**:
   - Create `.agent/rules/agent-skills.md` with ingestion, caching, and environment standards.
   - Update `.agent/rules/database.md` with batch API and modular schema rules.

6. **Verification**:
   - `tsc --noEmit` must pass.
   - `pnpm run db:generate:core` must generate clean migrations for the new tables.
   - `pnpm run migrate:local:core` must apply without errors.
