# Core GitHub API: Frontend Testing Protocol for Claude

This document provides exact, step-by-step instructions for autonomous UI testing of the Colby Ecosystem [`core-github-api`](https://core-github-api.hacolby.workers.dev/) frontend using your Chrome browser capabilities.

## 🛑 State Management & Crash Recovery (CRITICAL)
Your browser session may crash or timeout during extensive testing. **You MUST save your progress continuously.**

1. **Working File**: You will maintain a file named \`frontend-test-results.json\` in the root of the project workspace.
2. **Schema**:
   \`\`\`json
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
   \`\`\`
3. **Action Rule**: **AFTER EVERY SINGLE TEST CASE BELOW**, you must immediately use your file-writing tools to update \`frontend-test-results.json\` with the new result. **DO NOT** wait until the end of the script to save.

---

## 📂 Localized Review Protocols

In addition to this global frontend testing protocol, specific components and domains have their own localized `AGENTS-REVIEW.md` files. You **MUST** consult these when testing or modifying their respective areas:

- **Repo Actions & Agent Interactions**: [`src/frontend/src/components/repo-actions/AGENTS-REVIEW.md`](src/frontend/src/components/repo-actions/AGENTS-REVIEW.md)

---

## 🛠️ Setup & Pre-flight
1. Base URL: https://core-github-api.hacolby.workers.dev
2. Navigate to the base URL in your Chrome browser.
3. If presented with a login/auth screen (\`RequireAuth\` component), bypass or log in using local development credentials if requested, otherwise document that the page is properly protected.
4. **Important**: When testing repository-specific views (e.g., \`/repos/:owner/:repo\`), choose one of the available repositories from the dashboard or use a known test repository (e.g., \`jmbish04/core-github-api\`).

---

## 🧪 Test Execution Plan

Execute the following checks sequentially. **Remember to update \`frontend-test-results.json\` after every numbered item.**

### 1. Dashboard & Global Overview (\`/´ and \`/dashboard\`)
- [ ] **Action**: Navigate to the homepage (\`/\`) or \`/dashboard\`.
- [ ] **Verify Rendering**: Ensure the main dashboard elements and telemetry cards load without infinite spinners.
- [ ] **Verify Interaction**: 
  - Locate the \`LiveOpsConsole\` or Recent Tasks widgets.
  - Check that Cloudflare Account Spend or Repo Health cards render. If they fail to load data, document the error (e.g. data API issue).
- 💾 *Save result to JSON.*

### 2. Repositories Center (\`/repos\`)
- [ ] **Action**: Navigate to \`/repos\`.
- [ ] **Verify Rendering**: Wait for the list of repositories to mount. 
- [ ] **Verify Interaction**: 
  - Click on one of the repository cards to navigate to its specific workspace (should route to \`/repos/:owner/:repo/dashboard\`).
  - Verify that the nested routing works and the workspace mounts successfully.
- 💾 *Save result to JSON.*

### 3. Repository Workspace: Planning & Projects (\`/repos/:owner/:repo/projects\` or \`/repos/:owner/:repo/plan\`)
- [ ] **Action**: Once inside a repository workspace, navigate to its \`ProjectView\` (\`/projects\` or \`/plan\` tab).
- [ ] **Verify Rendering**: The file explorer tree and codebase overview should load successfully without throwing a \`TypeError\` mapping over undefined elements.
- [ ] **Verify Interaction**: 
  - Attempt to click on a file in the tree to view its contents in the code pane.
- 💾 *Save result to JSON.*

### 4. Global Chat (\`/chat\`)
- [ ] **Action**: Navigate to \`/chat\`.
- [ ] **Verify Rendering**: Ensure the new WebSocket streaming Assistant UI (\`WorkspaceChat\`) loads.
- [ ] **Verify Interaction**: 
  - Click the \`+\` button to create a new thread.
  - Open the Agent Selector dropdown (navbar) and ensure specific personas (e.g., \`Orchestrator\`, \`CF Agents SDK\`) are listed.
  - Send a simple "Hello" message and verify it hits the WebSocket backend and a response returns.
  - **AI Response Check**: Does the AI/agent actually respond with meaningful content (not just an error or empty message)? Time how long the response takes.
  - **Agent Selector Check**: Open the Agent Selector dropdown and confirm specialized personas are listed (e.g., `Orchestrator`, `CF Agents SDK`, `Cloudflare Docs`). Select a different agent and verify the chat context switches.
- 💾 *Save result to JSON.*

### 5. Research & Drafts (\`/research\`)
- [ ] **Action**: Navigate to \`/research\`. (This typically redirects to \`/research/custom\`).
- [ ] **Verify Rendering**: Ensure the Custom Jobs or Deep Research views load.
- [ ] **Verify Interaction**: 
  - Click "New Project" or "Create Draft" button.
  - Verify the button does *not* hang in a "Creating..." state and successfully redirects to the editor or creates the entity.
- 💾 *Save result to JSON.*

### 6. Health Check Grid (\`/health\`)
- [ ] **Action**: Navigate to \`/health\`.
- [ ] **Verify Rendering**: Look for the status indicators for D1, Webhooks, Vectorize, and System Logs.
- [ ] **Verify Interaction**: 
  - Identify if the statuses are "Active/Green" or "Failing/Red". Document the current health state in your JSON notes.
  - Click the "Run Health Check" button and wait to see if the UI updates gracefully or throws an exception.
- 💾 *Save result to JSON.*

### 7. Settings (\`/settings\`)
- [ ] **Action**: Navigate to \`/settings\`.
- [ ] **Verify Rendering**: Look for form fields related to environment variables, tokens, or preferences.
- [ ] **Verify Interaction**: Ensure form inputs are properly aligned and that sensitive fields (like tokens) are obscured.
- 💾 *Save result to JSON.*

### 8. Webhooks Logs (\`/webhooks\`)
- [ ] **Action**: Navigate to \`/webhooks\`.
- [ ] **Verify Rendering**: Ensure the table or list of webhook deliveries is visible (this might be empty if the D1 database is fresh, which is acceptable if it handles the 404 gracefully).
- [ ] **Verify Interaction**: Ensure no whitespace of death or unhandled errors are present.
- 💾 *Save result to JSON.*

### 9. Swagger / OpenAPI (\`/swagger\`)
- [ ] **Action**: Navigate to \`/swagger\`.
- [ ] **Verify Rendering**: Ensure the Swagger UI mounts. **Crucial**: It must successfully fetch the \`openapi.json\` from the Hono backend. If you see a "Failed to load API definition" error, this indicates the schema was rejected.
- [ ] **Verify Interaction**: Expand at least one API endpoint block to verify the parameter/schema documentation loaded.
- 💾 *Save result to JSON.*

### 10. Learning Dashboard (`/learning/dashboard`)
- [ ] **Action**: Navigate to `/learning/dashboard`.
- [ ] **Verify Rendering**: Ensure the page loads with a `bg-zinc-950` background. Verify the `InsightTrendChart` (Recharts AreaChart) and `PatternDistributionChart` (Recharts BarChart) render with data or empty-state placeholders. Look for the **Immunity Indicator** pulse dot (top-right corner) — it should be a small animated circle (green, amber, or zinc).
- [ ] **Verify Interaction**:
  - Confirm **NO visible borders** — cards should use `bg-zinc-900` tonal depth only.
  - Click each of the 4 navigation cards (Insight Ledger, Audit Log, Babysitter HUD, Showcase) and verify they route to `/learning/insights`, `/learning/sessions`, `/learning/babysitter`, and `/learning/showcase` respectively.
  - Verify chart axis/tooltip labels use high-contrast text (`fill="#fafafa"` or equivalent light color).
- 💾 *Save result to JSON.*

### 11. Insight Ledger (`/learning/insights`)
- [ ] **Action**: Navigate to `/learning/insights`.
- [ ] **Verify Rendering**: Look for a grid of `InsightCard` components. Each card should show: title, severity badge (1–5), pattern type, and a status indicator. If no data exists, verify empty-state is handled gracefully (no crash, no infinite spinner).
- [ ] **Verify Interaction**:
  - Locate the filter bar — it should have controls for `patternType` (doom_loop, anti_pattern, standard_violation, best_practice), `severity` (1–5), and `status` (open, acknowledged, resolved).
  - Toggle filters and verify the grid updates.
  - If pagination exists, click through pages.
- 💾 *Save result to JSON.*

### 12. Audit Log (`/learning/sessions`)
- [ ] **Action**: Navigate to `/learning/sessions`.
- [ ] **Verify Rendering**: Expect a `SessionsTable` with columns: Session ID, Trigger Type, Insights Found, Duration, Status badge. If empty, verify the empty state renders cleanly.
- [ ] **Verify Interaction**:
  - If rows are present, click on a row to expand/collapse it (should show message samples, repoless flag).
  - Verify no unhandled errors in the console.
- 💾 *Save result to JSON.*

### 13. Babysitter HUD (`/learning/babysitter`)
- [ ] **Action**: Navigate to `/learning/babysitter`.
- [ ] **Verify Rendering**: Expect `BabysitterSessionCard` components showing active Jules sessions. Each card should display: session ID, loop detection score (0–10 with color coding), last message preview, intervention count.
- [ ] **Verify Interaction**:
  - Locate the **"Manual Override"** button on a session card (or a global override button).
  - Click it and verify the state transition: button text should change from "Manual Override" → "Sending..." → "Override sent." (this calls `POST /api/learning/upscale`).
  - Verify the page refreshes or polls every ~30 seconds (check for `setInterval` behavior).
- 💾 *Save result to JSON.*

### 14. Standardization Showcase (`/learning/showcase`)
- [ ] **Action**: Navigate to `/learning/showcase`.
- [ ] **Verify Rendering**: Look for cards listing `.agent/rules/*.md` files — each card should show a rule name, summary, and adherence score.
- [ ] **Verify Interaction**:
  - Locate the **"Trigger Standardization Upscale"** CTA button.
  - Click it and verify it triggers an action (API call to `/api/learning/upscale` or similar).
  - If no rules are loaded, verify empty state handling.
- 💾 *Save result to JSON.*

### 15. Workshop (`/workshop`)
- [ ] **Action**: Navigate to `/workshop`.
- [ ] **Verify Rendering**: **CRITICAL** — This page has historically rendered as a black screen. Verify that the `WorkshopWizard` component actually mounts and displays content. Look for wizard steps, form fields, or a workshop interface.
- [ ] **Verify Interaction**:
  - If the wizard loads, attempt to interact with the first step (select a project, choose an action, etc.).
  - If the page is black/blank, document exactly what the console shows (errors, failed imports, etc.).
- 💾 *Save result to JSON.*

### 16. Health Service Verification (API/curl)
- [ ] **Action**: Test health and learning API endpoints via direct HTTP requests against `https://core-github-api.hacolby.workers.dev`. For each endpoint below, document the HTTP status code and a summary of the response body.
- [ ] **Endpoints to test**:
  - `GET /api/health` — Main system health. Expect `200` with status indicators.
  - `GET /api/projects/sentinel/health` — Sentinel subsystem health. Expect `200`.
  - `GET /api/learning/health` — Learning pipeline health. Expect `200` with `{ status, lastRun, insightCount }`.
  - `GET /api/projects/sentinel/status` — Sentinel live status + task counts. Expect `200`.
  - `GET /api/learning/insights` — List all learning insights. Expect `200` with array.
  - `GET /api/learning/sessions` — List learning sessions. Expect `200` with array.
  - `GET /api/learning/insights/global` — Aggregate pattern counts. Expect `200` with grouped data.
- [ ] **Verify**: Parse the JSON responses. Are all subsystems reporting healthy? Document any failures or unexpected responses.
- 💾 *Save result to JSON.*

### 17. Sentinel API Endpoints (Authenticated)
- [ ] **Action**: Test authenticated Sentinel endpoints. These require `Authorization: Bearer $AGENTIC_WORKER_API_KEY` header.
- [ ] **Endpoints to test**:
  - `GET /api/projects/sentinel/tasks/available` — List unclaimed tasks. Expect `200` with array.
  - `GET /api/projects/sentinel/status` — System status with task counts. Expect `200`.
  - `POST /api/projects/sentinel/ingest` with body `{"conversations":[{"role":"user","content":"test"}]}` — Expect `200` or `202`.
- [ ] **Auth rejection test**: Send a request with `Authorization: Bearer bad-key-12345` to any sentinel endpoint. Expect `401 Unauthorized`.
- [ ] **Verify**: Confirm that valid API key returns data and invalid key returns 401.
- 💾 *Save result to JSON.*

---

## 🏁 Finalization
Once all tests are completed, confirm that \`frontend-test-results.json\` contains exactly 17 test records. Output a brief final markdown summary in your conversational response detailing which pages failed and the likely cause (e.g., "500 Internal Server Error", "Infinite React Spinner", "WebSocket Timeout").
