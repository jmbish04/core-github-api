# Core GitHub API: Frontend Testing Protocol for Claude

This document provides exact, step-by-step instructions for autonomous UI testing of the Colby Ecosystem [`core-github-api`](https://core-github-api.hacolby.workers.dev/) frontend using your Chrome browser capabilities.

## 🛑 State Management & Crash Recovery (CRITICAL)
Your browser session may crash or timeout during extensive testing. **You MUST save your progress continuously.**

1. **Working File**: You will maintain a file named `frontend-test-results.json` in the root of the project workspace.
2. **Schema**:
   ```json
   {
     "last_updated": "ISO-Timestamp",
     "completed_tests": 0,
     "tests": [
       {
         "page": "/",
         "feature": "Dashboard / LiveOpsConsole",
         "status": "PASS | FAIL | BLOCKED",
         "notes": "Loaded successfully. Clicked X button, saw Y outcome."
       }
     ]
   }
   ```
3. **Action Rule**: **AFTER EVERY SINGLE TEST CASE BELOW**, you must immediately use your file-writing tools to update `frontend-test-results.json` with the new result. **DO NOT** wait until the end of the script to save.

---

## 📂 Localized Review Protocols

In addition to this global frontend testing protocol, specific components and domains have their own localized `AGENTS-REVIEW.md` files. You **MUST** consult these when testing or modifying their respective areas:

- **Repo Actions & Agent Interactions**: [`src/frontend/src/components/repo-actions/AGENTS-REVIEW.md`](src/frontend/src/components/repo-actions/AGENTS-REVIEW.md)

---

## 🛠️ Testing Directives
- **Zero Mock Data Policy**: Every module must rely on live API data. If a component is hardcoded or displaying fake fallback data, mark it as **FAIL**. 
- **Navigation Purity**: You must ensure that clicking links actually routes to the requested page (check your URL bar), rather than just re-rendering the same view or throwing a 404.
- **Action Buttons**: Form submissions, "Approve", "Save", and "Submit" buttons must be clicked. Verify that the UI updates (via Optimistic UI or a successful refetch) and that a network request actually occurs.
- **Reporting Bugs & Fix Prompts (CRITICAL)**: Whenever you encounter an error (e.g., 500 Network error, UI crash) or detect the usage of mock data, you must document it in your report **AND provide an actionable prompt** that can be copy-pasted to the development AI to fix it. Example format: `Prompt to fix: Please remove the mock array in RepoDashboard.tsx and integrate the live /api/telemetry endpoint`.
- **Repository Context**: When entering a repository workspace, you **MUST specifically navigate to and select `jmbish04/core-github-api`**. This is the active workspace for all repo-scoped testing.

---

## 🧪 Test Execution Plan

Execute the following checks sequentially. **Remember to update `frontend-test-results.json` after every numbered item.**

### ── 🌐 GLOBAL VIEWS ────────────────────────────────────

### 1. Dashboard & Global Overview (`/` and `/dashboard`)
- [ ] **Action**: Navigate to the homepage (`/`) or `/dashboard`.
- [ ] **Verify Rendering**: Ensure the main dashboard elements and telemetry cards load without infinite spinners.
- [ ] **Verify Interaction**: Locate the `LiveOpsConsole` or Recent Tasks widgets. Check that Cloudflare Account Spend or Repo Health cards render. If they fail to load data, document the error (e.g. data API issue). *Generate a prompt to fix if mock data is found.*
- [ ] **Action**: Click the refresh or date filter buttons on the dashboard widgets.
- [ ] **Verify Interaction**: Ensure the widgets re-fetch live data without crashing.
- 💾 *Save result to JSON.*

### 2. Repositories Center (`/repos`)
- [ ] **Action**: Navigate to `/repos`.
- [ ] **Verify Rendering**: Wait for the list of repositories to mount from the active user's GitHub installations.
- [ ] **Verify Interaction**: Verify the search bar or filter dropdowns successfully filter the repository cards.
- [ ] **Action**: Click on one of the repository cards (not `jmbish04/core-github-api`) to navigate to its scope.
- [ ] **Verify Interaction**: Verify that the nested routing works and the workspace mounts successfully. *Provide a prompt to fix if links are dead or route to 404.*
- 💾 *Save result to JSON.*

### 3. Global Project Management (`/projects`)
- [ ] **Action**: Navigate to `/projects`.
- [ ] **Verify Rendering**: Verify the global project directory mounts.
- [ ] **Verify Interaction**: Click the "New Project" button and ensure the creation modal drops down.
- [ ] **Action**: Click into an existing global project (e.g., `/projects/:projectId`).
- [ ] **Verify Rendering**: Ensure tasks, epics, and sub-groupings load dynamically. *Generate a prompt to fix if placeholder arrays are detected instead of API data.*
- 💾 *Save result to JSON.*

### 4. Global Chat (`/chat`)
- [ ] **Action**: Navigate to `/chat`.
- [ ] **Verify Rendering**: Ensure the WebSocket streaming Assistant UI (`WorkspaceChat`) fully mounts.
- [ ] **Action**: Open the Agent Selector dropdown in the navbar.
- [ ] **Verify Interaction**: Ensure specialized personas (e.g., `Orchestrator`, `CF Agents SDK`, `Cloudflare Docs`) are populated from the API. Select a different agent and verify the chat context switches.
- [ ] **Action**: Send a simple "Hello" message to the selected agent.
- [ ] **Verify Interaction**: Ensure it hits the WebSocket backend and a generative response returns. Time how long the response takes to stream tokens. *Generate a prompt to fix if WebSocket disconnects or throws a 500.*
- 💾 *Save result to JSON.*

### 5. Research Module (`/research`, `/research/custom`, `/research/chat`)
- [ ] **Action**: Navigate to `/research` and observe the redirect to `/research/custom`.
- [ ] **Verify Rendering**: Ensure the Custom Jobs panel and previous draft items load.
- [ ] **Action**: Navigate to `/research/daily-trends` and `/research/configure-cron` via the sub-navigation menu.
- [ ] **Verify Interaction**: In daily-trends, verify trend charts populate. In configure-cron, verify the cron builder toggles react to inputs.
- [ ] **Action**: Click the "New Project" or "Create Draft" button.
- [ ] **Verify Interaction**: Ensure the button transitions state without hanging and routes to the correct editor. *Provide a prompt to fix if the UI hangs forever.*
- 💾 *Save result to JSON.*

### 6. Workflows Engine (`/workflows`)
- [ ] **Action**: Navigate to `/workflows`.
- [ ] **Verify Rendering**: Ensure the active automations and triggers grid mounts natively.
- [ ] **Action**: Click "Create New Workflow" to route to `/workflows/new`.
- [ ] **Verify Rendering**: Check if the canvas builder or linear step editor mounts successfully without a blank screen. *Generate a prompt to fix if the canvas throws React errors.*
- 💾 *Save result to JSON.*

### 7. Sentinel Dashboard & Kanban (`/sentinel`)
- [ ] **Action**: Navigate to the global `/sentinel` dashboard.
- [ ] **Verify Rendering**: Ensure the active threat warnings, policy checks, and general Guardrail telemetry blocks mount.
- [ ] **Action**: Click over to `/sentinel/kanban`.
- [ ] **Verify Rendering**: Ensure columns render with live tasks indicating Sentinel intercepts or tasks under review (not mock data). *Provide a prompt to fix if placeholder tasks (`"task_1"`) appear.*
- 💾 *Save result to JSON.*

### 8. App Store & Standardization (`/apps`, `/standardization`)
- [ ] **Action**: Navigate to `/apps`.
- [ ] **Verify Rendering**: Verify that the global marketplace cards display actual integrated apps from the backend.
- [ ] **Action**: Navigate to `/standardization`.
- [ ] **Verify Rendering**: Verify the ruleset grid mounts. Check that actual `.agent/rules/` Markdown files are parsed and requested from the network layer.
- 💾 *Save result to JSON.*

### 9. Health & System Logs (`/health`, `/costs`, `/settings`, `/webhooks`, `/swagger`)
- [ ] **Action**: Navigate to `/health`.
- [ ] **Verify Rendering**: Check status indicators for D1, Webhooks, and Vectorize. Click the "Run Health Check" button and ensure UI handles the reload gracefully.
- [ ] **Action**: Navigate to `/swagger`.
- [ ] **Verify Interaction**: Ensure Swagger UI fetches `openapi.json` without CORS/404 errors. Expand an endpoint block to read parameter documentation. *Generate a prompt to fix if the schema request rejects.*
- [ ] **Action**: Navigate to `/webhooks`.
- [ ] **Verify Rendering**: Ensure the list of webhook deliveries is visible (an empty state is acceptable if the database is 404/clean, but a UI crash is a FAIL).
- 💾 *Save result to JSON.*

### ── 🧠 GLOBAL LEARNING ENGINE ─────────────────────────

### 10. Learning Dashboard (`/learning/dashboard`)
- [ ] **Action**: Navigate to `/learning/dashboard`.
- [ ] **Verify Rendering**: Ensure the page loads with a `bg-zinc-950` background. Verify the `InsightTrendChart` (Recharts AreaChart) and `PatternDistributionChart` (Recharts BarChart) render with data or empty-state placeholders.
- [ ] **Verify Interaction**: Look for the **Immunity Indicator** pulse dot (top-right corner) — it should be a small animated circle.
- [ ] **Verify Theme**: Confirm **NO visible borders** around cards — they should use `bg-zinc-900` tonal depth only. *Provide a prompt to fix if standard Tailwind 1px borders are present.*
- [ ] **Action**: Click each of the 4 navigation cards to ensure they route to their specific Hubs.
- 💾 *Save result to JSON.*

### 11. Insight Ledger (`/learning/insights`)
- [ ] **Action**: Navigate to `/learning/insights`.
- [ ] **Verify Rendering**: Look for a grid of `InsightCard` components showing severity badges (1–5) and pattern types.
- [ ] **Action**: Locate the filter bar. Toggle filters for `patternType` (doom_loop, anti_pattern, etc) and `severity`.
- [ ] **Verify Interaction**: Verify the grid actively filters based on your toggles. Verify empty-states are handled gracefully. *Generate a prompt to fix if the grid fails to filter or crashes when empty.*
- [ ] **Verify Theme**: Verify chart axis/tooltip labels use high-contrast text (`fill="#fafafa"` or equivalent).
- 💾 *Save result to JSON.*

### 12. Audit Log Sessions (`/learning/sessions`)
- [ ] **Action**: Navigate to `/learning/sessions`.
- [ ] **Verify Rendering**: Expect a `SessionsTable` with columns: Session ID, Trigger Type, Duration, Status.
- [ ] **Action**: Click on a specific Session row.
- [ ] **Verify Interaction**: Ensure the row expands to show message samples or raw LLM output. Verify no unhandled exceptions fire in the console. *Generate a prompt to fix if row expansion fails.*
- 💾 *Save result to JSON.*

### 13. Babysitter HUD (`/learning/babysitter`)
- [ ] **Action**: Navigate to `/learning/babysitter`.
- [ ] **Verify Rendering**: Expect `BabysitterSessionCard` components showing active Jules sessions with loop detection scores (0–10).
- [ ] **Action**: Click the "Manual Override" button on a session card.
- [ ] **Verify Interaction**: Verify the state transitions: "Manual Override" → "Sending..." → "Override sent." (proving `/api/learning/upscale` or related hook is called). *Provide a prompt to fix if button breaks.*
- 💾 *Save result to JSON.*

### 14. Standardization Showcase (`/learning/showcase`)
- [ ] **Action**: Navigate to `/learning/showcase`.
- [ ] **Verify Rendering**: Look for cards listing rule files with summaries and adherence scores.
- [ ] **Action**: Click the "Trigger Standardization Upscale" CTA button.
- [ ] **Verify Interaction**: Verify it triggers an optimistic UI loading state. *Generate a prompt to fix if button does nothing.*
- 💾 *Save result to JSON.*

### ── 🧑‍💻 JULES WORKSPACE (GLOBAL) ──────────────────────

### 15. Jules Hub (`/jules`, `/jules/tasks`, `/jules/settings`)
- [ ] **Action**: Navigate to `/jules`.
- [ ] **Verify Rendering**: Ensure Jules Home, Recent Tasks, and Activity lists populate.
- [ ] **Action**: Navigate to `/jules/tasks/new`.
- [ ] **Verify Rendering**: Verify form fields load to dispatch a new autonomous task.
- [ ] **Action**: Click into the `/jules/design` UI.
- [ ] **Verify Interaction**: Ensure the Design Lab sandbox canvas mounts correctly. *Generate a prompt to fix if the canvas throws React errors or loads mock components.*
- 💾 *Save result to JSON.*

### ── 📂 REPOSITORY-SCOPED VIEWS (`jmbish04/core-github-api`) ─────────

*CRITICAL: You must explicitly navigate to and select the `jmbish04/core-github-api` workspace before starting this section. You are instructed to FULLY AND COMPREHENSIVELY test every single component, tab, sub-page, and button in this workspace. If any feature fails or uses mock data, you MUST include a 'fix prompt' in your report notes.*

### 16. Repo Dashboard (`/repos/jmbish04/core-github-api/dashboard`)
- [ ] **Action**: Navigate to `/repos/jmbish04/core-github-api/dashboard`.
- [ ] **Verify Rendering**: Locate the main telemetry cards (e.g., Build Status, PRs, Issues). Ensure no card displays an infinite loading spinner.
- [ ] **Verify Interaction**: Ensure the data across the dashboard is dynamically fetched from the live API, strictly not using mock fallback data. *If mock data is found, report a Prompt to fix.*
- [ ] **Action**: Click the "View Repository Stats", "Recent Commits", or similar detail tracking button on the dashboard widgets.
- [ ] **Verify Navigation**: Ensure it redirects correctly without an error boundary triggering.
- 💾 *Save result to JSON.*

### 17. Repo Stats & Analytics (`/repos/jmbish04/core-github-api/stats`)
- [ ] **Action**: Navigate to `/repos/jmbish04/core-github-api/stats`.
- [ ] **Verify Rendering**: Locate the main analytics charts (e.g., Code Frequency, Merge Times).
- [ ] **Verify Interaction**: Change the global time filter (e.g., 7d, 30d, All Time) if available. Ensure the charts dynamically update.
- [ ] **Verify Interaction**: Hover over chart data points to ensure the tooltip renders correctly and displays real data elements.
- 💾 *Save result to JSON.*

### 18. Codebase Plan & File Explorer (`/repos/jmbish04/core-github-api/plan`)
- [ ] **Action**: Navigate to `/repos/jmbish04/core-github-api/plan`.
- [ ] **Verify Rendering**: Ensure the File Explorer tree view mounts successfully.
- [ ] **Action**: Deeply navigate the file tree by clicking at least 3 nested folders to expand them.
- [ ] **Verify Interaction**: Click on a specific file (e.g., `package.json` or `.ts` file) and ensure the code syntax viewer renders the file contents correctly without throwing a `TypeError`.
- [ ] **Action**: Click the "Overview" or "README" tab if available in the codebase overview pane.
- [ ] **Verify Rendering**: Ensure markdown is rendered and readable without layout breakages.
- 💾 *Save result to JSON.*

### 19. Project Tracker: Linear List View (`/repos/jmbish04/core-github-api/projects/tracker-beta/list`)
- [ ] **Action**: Navigate to `/repos/jmbish04/core-github-api/projects/tracker-beta/list`.
- [ ] **Verify Rendering**: The tracker rows must load the actual database-backed project backlog (Epics, Stories, Tasks), strictly avoiding mock placeholder arrays. *Report any mock data with a corresponding fix prompt.*
- [ ] **Action**: Click on a specific task row.
- [ ] **Verify Interation**: This must open a side panel or detailed view modal with the task title, description, assignee, and status.
- [ ] **Action**: Modify the status of the task via the dropdown in the detail pane.
- [ ] **Verify Backend Sync**: Ensure the UI updates optimistically or after a refetch, and ensure no 500 network error occurs.
- 💾 *Save result to JSON.*

### 20. Project Tracker: Kanban Board View (`/repos/jmbish04/core-github-api/projects/tracker-beta/board`)
- [ ] **Action**: Navigate to or toggle over to the Kanban Board via the sub-navigation (`/board`).
- [ ] **Verify Rendering**: Verify that Kanban columns (e.g., Todo, In Progress, Done) render the same live tasks verified in the List View.
- [ ] **Action**: Click the "Create Task" or `+` button in a specific column.
- [ ] **Verify Interaction**: Ensure the task creation modal opens, accepts keyboard inputs, and upon submittal, renders the new task card in the column to prove roundtrip DB execution. *Report failures with a corresponding fix prompt.*
- 💾 *Save result to JSON.*

### 21. PR Command Center (`/repos/jmbish04/core-github-api/pr-center`)
- [ ] **Action**: Navigate to `/repos/jmbish04/core-github-api/pr-center`.
- [ ] **Verify Rendering**: Confirm the Pull Request list populates from the live GitHub integration. *Provide a fix prompt if dummy hardcoded PRs are rendered.*
- [ ] **Action**: Click into an active Pull Request context row.
- [ ] **Verify Interaction**: Ensure the AI Review summary, file diffs, and inline comment components load fully.
- [ ] **Action**: Click the "Start Review" or "Request Agent Analysis" button.
- [ ] **Verify Backend Sync**: Ensure the loading state activates and it calls the backend service cleanly without 400/500 errors.
- 💾 *Save result to JSON.*

### 22. App Tools: Cloudflare Docs & Component Identifier (`/repos/jmbish04/core-github-api/tools/...`)
- [ ] **Action**: Navigate to `/repos/jmbish04/core-github-api/tools`.
- [ ] **Action**: Click the specific "Cloudflare Docs" tool card.
- [ ] **Verify Interaction**: Verify the search input works and retrieves actual Cloudflare documentation results via the MCP server integration.
- [ ] **Action**: Return to the tools menu and click "Component Identifier".
- [ ] **Verify Interaction**: Ensure the image upload/dropzone mechanism renders and the backend scanner initializes. *Log errors with a fix prompt.*
- 💾 *Save result to JSON.*

### 23. App Tools: VibeSDK (`/repos/jmbish04/core-github-api/tools/vibesdk`)
- [ ] **Action**: Launch the VibeSDK tool from the tools menu.
- [ ] **Verify Rendering**: Ensure the design tokens editor and color palette sliders mount correctly.
- [ ] **Action**: Adjust a slider or toggle a theme variable on the left rail.
- [ ] **Verify Interaction**: Ensure the live preview component on the right immediately reacts to the design token update.
- 💾 *Save result to JSON.*

### 24. UX Workshop & Design Sandbox (`/repos/jmbish04/core-github-api/ux-workshop`)
- [ ] **Action**: Load the UI Workshop scoped page.
- [ ] **Verify Rendering**: Ensure the multi-step `WorkshopWizard` component renders its layout rather than remaining unmounted.
- [ ] **Verify Interaction**: Ensure you can click through Step 1 ("Overview") to Step 2 ("Sandbox"). Check that local component isolation renders the desired UI testbed without breaking the main CSS grid.
- 💾 *Save result to JSON.*

### 25. Sentinel HUD Guardrails (`/repos/jmbish04/core-github-api/sentinel`)
- [ ] **Action**: Navigate to the repository-scoped Sentinel HUD.
- [ ] **Verify Interaction**: Click all context toggles (Rules, Active Warnings, Configurations).
- [ ] **Verify Rendering**: Verify the context is explicitly locked to `jmbish04/core-github-api` and that interacting with the AI agent rules in this workspace handles queries successfully. *Generate a fix prompt for any permissions or 500 crash escapes.*
- 💾 *Save result to JSON.*

### 26. Repo-Scoped CI Healer Build Logs (`/repos/jmbish04/core-github-api/pr-command/*/build/logs`)
- [ ] **Action**: Access the raw logs directly through the network path `/api/frontend/repos/jmbish04/core-github-api/pr-command/1/build/logs/raw` (or your valid PR ID) either via UI request or a direct GET.
- [ ] **Verify Rendering/Data**: The response MUST NOT return "Failed to lookup worker name". It should return a valid plain text dump or `{ "isSuccess": false, "errorMessage": "No deployments found..." }` if there's no worker setup.
- [ ] **Verify Dynamic Resolution**: This proves that the `analyzeBuildFailure` and `fetchBuildLogs` gracefully resolve `core-github-api`'s correct worker name without relying on the old `inferWorkerName`.
- [ ] **Fix Prompt Generation**: If a 500 error is thrown due to missing backend environment credentials or Wrangler Inspector failure, generate a distinct prompt back to the code agent.
- 💾 *Save result to JSON.*

### ── 📡 BACKEND HEALTH VERIFICATION (CURL / API) ──────

### 27. Health Service Verification
- [ ] **Action**: Test health API endpoints via direct HTTP requests.
- [ ] **Endpoints to test**:
  - `GET /api/health` — Main system health. Expect `200` with status indicators.
  - `GET /api/projects/sentinel/health` — Sentinel subsystem health. Expect `200`.
  - `GET /api/learning/health` — Learning pipeline health. Expect `200`.
  - `GET /api/projects/sentinel/status` — Sentinel live status + task counts. Expect `200`.
  - `GET /api/learning/insights` — List all learning insights. Expect `200`.
- [ ] **Verify**: Parse the JSON. Document any failures or unexpected 500s.
- 💾 *Save result to JSON.*

### 28. Sentinel API Endpoints (Authenticated)
- [ ] **Action**: Test authenticated Sentinel endpoints. These require `Authorization: Bearer $AGENTIC_WORKER_API_KEY` header.
- [ ] **Endpoints to test**:
  - `GET /api/projects/sentinel/tasks/available`
  - `POST /api/projects/sentinel/ingest` with body `{"conversations":[{"role":"user","content":"test"}]}`
- [ ] **Verify**: Confirm that a valid API key returns `200`/`202` data and an invalid key returns `401 Unauthorized`.
- 💾 *Save result to JSON.*

### 29. Human-In-The-Loop: Dashboard (`/hitl`)
- [ ] **Action**: Navigate to `/hitl`.
- [ ] **Verify Rendering**: Ensure the overview cards for Jules Sessions and Build Failures load successfully, displaying the current pending count dynamically fetched from `api.hitl.summary`. *Provide a fix prompt if dummy mock counts are used.*
- [ ] **Action**: Click the "Jules Sessions" overview card.
- [ ] **Verify Interaction**: Ensure it routes to `/hitl/jules-sessions`.
- 💾 *Save result to JSON.*

### 30. Human-In-The-Loop: Jules Sessions Queue (`/hitl/jules-sessions`)
- [ ] **Action**: Navigate to `/hitl/jules-sessions`.
- [ ] **Verify Rendering**: Verify the payload structure of a pending Jules Session action renders in a monospaced block without crashing.
- [ ] **Verify Interaction**: Type feedback into the manual override textarea and click "Reject". Confirm optimistic UI update/backend fetch removes it from the list. *Provide a fix prompt if 500 error.*
- 💾 *Save result to JSON.*

### 31. Human-In-The-Loop: Build Analysis Queue (`/hitl/build-analysis`)
- [ ] **Action**: Navigate to `/hitl/build-analysis`.
- [ ] **Verify Rendering**: Ensure the UI safely mounts the extracted raw logs block and proposed fix prompt from CI Healer.
- [ ] **Verify Interaction**: Click "Approve & Dispatch Repair". Ensure successful RPC execution without UI hang. *Provide a fix prompt if button does nothing.*
- 💾 *Save result to JSON.*

### 32. CI Healer Document View (`/learning/healer`)
- [ ] **Action**: Navigate to `/learning/healer`.
- [ ] **Verify Rendering**: Ensure the Document TSX mounts detailing the backend worker name lookup APIs, Jules workflow orchestration, and Hitl loop.
- [ ] **Verify Links**: Ensure GitHub code links in the document properly form a URL and open successfully in a new tab. *Provide a fix prompt if links 404.*
- 💾 *Save result to JSON.*

---

## 🏁 Finalization
Once all tests are completed, confirm that `frontend-test-results.json` contains exactly 28 test records. Output a brief final markdown summary in your conversational response detailing which pages failed and the likely cause (e.g., "500 Internal Server Error", "Infinite React Spinner", "WebSocket Timeout").
