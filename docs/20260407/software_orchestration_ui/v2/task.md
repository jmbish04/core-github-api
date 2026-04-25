# Software Orchestration Integration

- `[x]` 1. Create `src/backend/src/ai/agents/orchestration/health.ts` for orchestration health.
- `[x]` 2. Update `src/backend/src/health/coordinator.ts` to register `checkOrchestrationHealth`.
- `[x]` 3. Check where `api/docs/agents` is populated if needed, or if static docs work based on other lists.
- `[x]` 4. Create `src/frontend/src/pages/docs/software-orchestration.astro`.
- `[x]` 5. Create `src/frontend/src/components/docs/SoftwareOrchestrationDoc.tsx`.
- `[x]` 6. Create backend API endpoint for fetching planning session chatrooms (from D1 `project_planning_requests` / `planning_room_logs`).
- `[x]` 7. Create `src/frontend/src/pages/control/global/planning-rooms.astro`.
- `[x]` 8. Create `src/frontend/src/views/control/global/PlanningRoomsList.tsx`.
- `[x]` 9. Modify `src/frontend/src/views/repos/ProjectsBeta.tsx` to include an embedded PlanningRoom for the project.
