---
description: How to implement a new Global Automation Workflow for GitHub events
---

# Workflow: Implementing a New Automation Workflow

To add a new GitHub webhook automation to the repository, follow these standards:

1. **Domain Class Creation**:
   - Create a new TypeScript file in `backend/src/automations/[domain]/[WorkflowName]Automation.ts`.
   - Ensure the new class extends `BaseAutomation` from `@/core/BaseAutomation`.

2. **Lifecycle Hooks**:
   - Implement the mandatory `shouldExecute()` function containing all conditional logic (checking the payload, identifying the target repo, checking if specific files exist contextually, etc.). The router will bypass execution if this returns `false`.
   - Implement the `execute()` function containing the main action. Include detailed structured logging. Dual-authentication will automatically provide `this.octokit` (App Installation by default, fallback to PAT if configured in D1).

3. **Automation Registry**:
   - Add your class name into `backend/src/core/AutomationRegistry.ts` under the registry object mapping the class name to its exported module.
   - If the automation must run for every user invariably without opt-in (e.g. system telemetry), add it to the `SystemAutomations` array within the registry.

4. **Frontend Activation**:
   - The UI Dashboard (`/workflows`) dynamically discovers missing configured classes via the registry and will populate the new automation in gray.
   - An admin must visit the Workflows tab and toggle it "Active" with the correct Identity pattern (App / PAT) to provision it globally.

5. **Agentic Workflows**:
   - Users can now use the **Automation Architect** agent in the `/workflows` sidebar to generate these class files automagically based on natural language prompts.
