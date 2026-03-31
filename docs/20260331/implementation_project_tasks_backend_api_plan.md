# Project Tasks Backend & API Implementation

The goal is to provide a comprehensive REST API to replace the manual `seed_project_tasks.py` workflow. The API will allow planning agents to upsert `project_tasks` against a specific `:owner/:repo` pair, persisting data into newly expanded Drizzle schemas.

## User Review Required

> [!WARNING]
> Please review the schema changes below! Currently, `epics`, `stories`, and `tasks` only point directly to `repoId`. Modifying them to also include `projectId` and `phaseId` might require a migration strategy. I recommend keeping `projectId` and `phaseId` **nullable** initially to maintain backwards compatibility with existing rows until backfill scripts are applied.

## Proposed Changes

### Database Schemas (Drizzle ORM)
---

#### [NEW] `src/backend/src/db/schemas/projects/backlog/projects.ts`
- **Purpose**: Defines the `projects` table.
- **Columns**:
  - `id` (integer auto pk, using `integer('id').generatedAlwaysAsIdentity()`)
  - `repoId` (fk to `repositories.id`)
  - `name` (text)
  - timestamps (`createdAt`, `updatedAt`)

#### [NEW] `src/backend/src/db/schemas/projects/backlog/artifacts.ts`
- **Purpose**: Tracks structured artifacts (e.g., PRDs, stitch plans) over time via revisions.
- **Columns**:
  - `id` (integer identity)
  - `projectId` (fk to `projects.id`)
  - `artifactType` (text - e.g., 'PRD', 'STITCH_PLAN')
  - `revisionNumber` (integer)
  - `content` (text)
  - timestamp (`createdAt`)

#### [NEW] `src/backend/src/db/schemas/projects/backlog/phases.ts`
- **Purpose**: Tracks project phases natively within the DB.
- **Columns**:
  - `id` (integer identity)
  - `projectId` (fk to `projects.id`)
  - `number` (integer)
  - `order` (integer)
  - `title` (text)
  - `description` (text)
  - `status` (text)
  - `assignee` (text)
  - `notes` (text)
  - `updates` (text)
  - timestamps

#### [MODIFY] `src/backend/src/db/schemas/projects/backlog/epics.ts`
#### [MODIFY] `src/backend/src/db/schemas/projects/backlog/stories.ts`
#### [MODIFY] `src/backend/src/db/schemas/projects/backlog/tasks.ts`
#### [MODIFY] `src/backend/src/db/schemas/projects/backlog/index.ts`
- Append `projectId` (integer, nullable) and `phaseId` (integer, nullable) columns as foreign keys.
- Update `index.ts` to export the new tables and setup `relations()` for nested JSON retrieval.

### Backend API (Hono)
---

#### [NEW] `src/backend/src/routes/api/projects/backlog/index.ts`
- Create the core `projects.backlog` API with Hono.
- Provides robust REST methods for Project/Phase/Artifact upserts.
- Orchestrates `projectId`/`phaseId` linkages when writing `epics`, `stories`, `tasks`.

#### [MODIFY] `src/backend/src/routes/api/index.ts`
#### [MODIFY] `src/backend/src/routes/index.ts`
- Mount `/api/projects/backlog` cleanly into the unified router tree.

### Frontend
---

#### [NEW] `src/frontend/src/pages/docs/project-tasks.astro`
- Provide detailed API documentation using Astro Shadcn standard architecture.
- Build a React-based UI (island) allowing users to paste a Gemini payload to instantly seed/upsert `#1`, `#2`, and `#3` records, triggering planning operations.

## Open Questions

1. Should `projectId` and `phaseId` be strictly enforced (`NOT NULL`) or nullable for now? (Given existing data, I recommend nullable to start).
2. Are there specific components (e.g. `textarea`, `Card`) you want for the frontend payload-paster island?
3. What is the API endpoint name preference: `/api/projects/backlog/`?

## Verification Plan

### Automated Tests
- Run `pnpm run check` to verify TypeScript builds.
- Run `drizzle-kit generate` and ensure migrations are correctly created.

### Manual Verification
- Deploy via `--dry-run` to ensure Cloudflare compatibility.
- Open `/docs/project-tasks` in the frontend locally to test the submission payload.
