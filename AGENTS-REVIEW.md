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

---

## 🏁 Finalization
Once all tests are completed, confirm that \`frontend-test-results.json\` contains exactly 9 test records. Output a brief final markdown summary in your conversational response detailing which pages failed and the likely cause (e.g., "500 Internal Server Error", "Infinite React Spinner", "WebSocket Timeout").
