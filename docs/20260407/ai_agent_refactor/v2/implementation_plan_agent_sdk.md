# Software Orchestration UI and Health Architecture

This plan covers the final polish and integration layer for the `SoftwareEngineerAgent` and `PlanningRoom` features based on the backend groundwork completed in the previous step.

## User Review Required

> [!IMPORTANT]
> - Do you want the global chatrooms list to only show active PlanningRooms, or also include closed/archived sessions based on D1 state?
> - For the project viewport integration, should the active chatroom be displayed inside `TrackerLayoutBeta` or `ProjectsBeta.tsx`?

## Proposed Changes

### 1. Robust Health Checks (Backend)
Add dedicated health checks for the new stateful orchestration architecture to ensure high availability.

#### [NEW] `src/backend/src/ai/agents/orchestration/health.ts`
- Implement `checkOrchestrationHealth(env: Env, coordinator: HealthCoordinator)`:
  - Verifies connectivity to the `SoftwareEngineerAgent` binding.
  - Verifies connectivity to the `PlanningRoom` binding.
  - Validates integration with `CLOUDFLARE_DOC_AGENT` to protect parallel research.

#### [MODIFY] `src/backend/src/health/coordinator.ts`
- Import and register `checkOrchestrationHealth` within the system's test suite to ensure standard monitoring covers orchestration scenarios.

---

### 2. Software Orchestration Documentation (Frontend)
Build the frontend documentation pages properly integrating them into the Astro / TypeScript layout.

#### [NEW] `src/frontend/src/pages/docs/software-orchestration.astro`
- Astro page integrating the base `DocsLayout` specific for the new agent, mimicking standard static assets setup. This gives us the routable endpoint `/docs/software-orchestration`.

#### [NEW] `src/frontend/src/components/docs/SoftwareOrchestrationDoc.tsx`
- The React island for the content. It will explain:
  - What the `SoftwareEngineerAgent` does.
  - The API structure (`/api/agent-planning/orchestrate`).
  - How `PlanningRoom` functions as a multiparty WebSocket hub.

#### [MODIFY] `src/frontend/src/components/docs/agents-registry.ts`
- Add an entry for `software-orchestration` here.

---

### 3. Global Active Project Chatrooms View
Provide users with a unified dashboard to monitor all active/historical planning sessions.

#### [NEW] `src/frontend/src/pages/control/global/planning-rooms.astro`
- Route: `/control/global/planning-rooms` - A global viewport to see all active project chatrooms.

#### [NEW] `src/frontend/src/views/control/global/PlanningRoomsList.tsx`
- The React page wrapper that uses API hooks to fetch records from `project_planning_requests` or agent mirror data and streams via WebSockets.

---

### 4. Projects Viewport Integration
Connect a visual interface inside the `repo` dashboard where planning sessions are initiated, ensuring a human-in-the-loop steering wheel.

#### [MODIFY] `src/frontend/src/views/repos/ProjectsBeta.tsx` (or `Overview.tsx` / `Plan.tsx` depending on preference)
- Add a new tab/overlay that mounts the `Chat.tsx` component attached to a standard `useAgentRuntime` targeting the specific repo's `planning_session_id`.
- Enable steering by ensuring WebSocket interactions bubble to the `PlanningRoom`.

## Open Questions

> [!WARNING]
> - Do you want the backend to expose a `/api/planning-rooms` list endpoint using D1 records for the global viewer? Let me know so I can adjust the backend routes.

## Verification Plan

### Automated Tests
- The new `checkOrchestrationHealth` will be automatically tested via the `/api/ops/health` endpoint.

### Manual Verification
- We will boot the dev environment, visit `/docs/software-orchestration`, then visit the `/control/global/planning-rooms` global list. Finally we will navigate to a repo view and trigger the chatroom panel visually.
