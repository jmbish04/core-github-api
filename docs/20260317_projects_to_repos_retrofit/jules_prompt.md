# Instructions for Jules (Coding Agent)

You are tasked with executing the **Projects to Repos Retrofit**. You will be working from the master task list located in `docs/20260317_projects_to_repos_retrofit/project_tasks.json`.

## MANDATORY EXECUTION PROTOCOL

1. **State Management:**
   - You MUST update `project_tasks.json` in real-time as you work.
   - When you start a task, change its status to `"started"`.
   - When you complete a step, change its status to `"complete"`.
   - You may ONLY change a task status to `"complete"` if ALL `success_criteria` for that task have been demonstrably met.

2. **Database & Migrations (`Phase 1`):**
   - The user architecture is changing to a single-tenant model. You are stripping `.notNull()` requirements from `userId` fields in `backend/src/db/schemas/github/*.ts`.
   - Merge operations from `backend/src/db/ops/repos.ts` into `backend/src/db/schemas/github/repos.ts`.
   - **CRITICAL:** You must run `pnpm run db:generate` to generate the SQL migrations once the TS schemas are updated.

3. **API & Routing (`Phase 2`):**
   - Ensure all references to `/api/projects` are updated to `/api/repos`.
   - Ensure `userId` is stripped from Zod validation schemas (`z.object({...})`) for these routes so the frontend is not forced to send it.

4. **Frontend Integration (`Phase 3`):**
   - Update `Sidebar.tsx` and `AppSidebar.tsx` to display `[icon: github] Repos` instead of `+ Projects`.
   - The **Active Workspaces** component must fetch from `/api/frontend/repos/favorites` on mount. Ensure the types match the new joined query provided in the PRD.
   - Update client-side navigation links from `/projects/...` to `/repos/...`.

## ENFORCEMENT
If you encounter a blocked dependency (e.g., a migration fails), mark the task as `"blocked"`, log the error in the task description, and stop execution until resolved. Do not skip phases.