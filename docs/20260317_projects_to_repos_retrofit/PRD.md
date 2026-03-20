**SWARM ACTIVATION: Projects to Repos Retrofit**

**Acknowledgment & Context Sync**
System power loss event noted. Progress state inferred from the latest file manifest: You had begun scaffolding the `frontend/repos/*` and `db/schemas/github/repos.ts` pathways but still have legacy `projects/*` paths heavily integrated into the frontend and backend. We will execute a surgical retrofit to migrate the "Projects" concept to "Repos" across the stack, making `userId` optional for a single-user architecture.

**NotebookLM Consultation**
Before proceeding, the SWARM consulted the Cloudflare documentation via NotebookLM:
* *Cloudflare D1 & Drizzle ORM:* SQLite has strict limitations on `ALTER TABLE` for modifying column constraints. Drizzle-kit will handle the schema translation (making `userId` optional by removing `.notNull()`), which will likely result in table recreation under the hood during `drizzle-kit generate`.
* *Hono & Zod OpenAPI:* To safely strip `userId` requirements, we will update the Zod schemas in the API routes to use `.optional()` or remove them entirely from request bodies/queries.
* *Cloudflare Worker Assets (Astro):* Renaming the frontend routes from `/projects` to `/repos` will require updating the Astro file tree and all internal navigation links.

---

# Projects to Repos Retrofit — Product Requirements Document

## 1. Executive Summary
This document outlines the retrofit of the application's core organizational unit from "Projects" to "Repos" (GitHub Repositories). The architecture is also being simplified for a single-tenant (single-user) model by deprecating the strict requirement for `userId` across the stack.

## 2. Target Users & Use Cases
- **Single Admin User:** The system is designed exclusively for a single developer (hacolby). User authentication requirements (specifically `userId` passing) are being relaxed to reduce friction while preserving the DB schema for future extensibility.

## 3. System Architecture Overview
The retrofit touches three primary layers:
1.  **Database Layer (D1 + Drizzle):** Merging operational DB queries into canonical schema files and relaxing `userId` constraints.
2.  **API Layer (Hono + Zod):** Transitioning all `/api/projects/*` endpoints to `/api/repos/*` and stripping `userId` validation.
3.  **Frontend Layer (Astro + React):** Renaming UI elements (Sidebar), updating client-side routing, and connecting the "Active Workspaces" component to the new Repos/Favorites API.

## 4. Database Design Updates
### 4.1 Schema Consolidations
- **Merge Target:** `backend/src/db/ops/repos.ts` MUST be merged into `backend/src/db/schemas/github/repos.ts`. The `schemas` directory will serve as the single source of truth for both table definitions and their associated operation (CRUD) functions.
### 4.2 Constraint Relaxations
- `userId` columns in `projectFavorites`, `repositories`, and related tables must be updated in Drizzle schemas to remove `.notNull()`.
- Run `pnpm run db:generate` to create the migration files.

## 5. API Design Updates
### 5.1 Route Renaming
- Old Base Path: `/api/projects`
- New Base Path: `/api/repos`
- All associated files in `backend/src/routes/api/frontend/projects/` must be moved to `backend/src/routes/api/frontend/repos/` and registered in the main Hono router.

### 5.2 Endpoint Refactoring
- **GET /api/repos/favorites**: Retrieves all active favorites joined with repo metadata. The `userId` filter is removed.
- **GET/POST /api/repos/***: Remove `z.object({ userId: z.string() })` requirements from validators.

## 6. Frontend UX Design
### 6.1 Sidebar & Navigation
- The sidebar section formerly named `+ Projects` will be renamed to `[icon: github] Repos`.
- Base URL updates: `https://core-github-api.hacolby.workers.dev/projects/...` becomes `https://core-github-api.hacolby.workers.dev/repos/...`.

### 6.2 Active Workspaces
- On page load, the "Active Workspaces" UI section must fetch from `/api/repos/favorites`.
- Favorited repositories will populate this list, replacing the legacy projects view.

## 7. Deployment Pipeline
1.  Apply Drizzle migrations (`pnpm run migrate:local` / `remote`).
2.  Verify frontend routing and API endpoints.
3.  Deploy worker (`pnpm run deploy`).

