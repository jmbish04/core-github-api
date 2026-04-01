# Stitch-Ready Requirements: Frontend UX Study for Cloudflare Worker GitHub Proxy

## 1. Executive Summary
This document outlines the UX research and design study requirements for the frontend interface of the **Cloudflare Worker GitHub Proxy**. The backend serves as a robust proxy for the GitHub API, providing high-level flows, tools, generic REST/GraphQL proxies, and an advanced Agentic Orchestration layer. The goal of this study is to design a cohesive, intuitive, and efficient UI that surfaces these capabilities to developers and AI operators, bridging the gap between raw API power and human-centric workflows.

## 2. Target Audience
*   **Developers/DevOps Engineers:** Users who need to perform bulk repository operations, manage automated workflows (Flows API), or run specific GitHub proxy commands without writing custom scripts.
*   **AI Operators/Researchers:** Users leveraging the Agentic Orchestration layer to perform natural language searches, deep codebase analysis, and review AI-generated reports on GitHub activity.

## 3. Core Objectives
1.  **Demystify Agentic Orchestration:** Create a transparent interface for users to monitor the state of AI agents (e.g., `ResearchAgent`), view real-time WebSocket updates of workflows (like `DeepResearchWorkflow`), and intervene via Human-in-the-Loop (HITL) approvals.
2.  **Simplify Bulk Operations (Flows):** Design intuitive wizards for high-level tasks like `create-new-repo` and `retrofit-workflows` across multiple repositories.
3.  **Provide a "Console" Experience for Proxies:** Offer a clean, structured playground for developers to test and execute REST/GraphQL proxy requests directly from the UI.

## 4. Key User Journeys (UX Flows to Design)

### Journey A: The Agentic Research Console
*   **Trigger:** User inputs a natural language prompt (e.g., "Analyze facebook/react architecture").
*   **Flow:**
    1.  User enters prompt in a persistent chat/command interface.
    2.  System visualizes the Orchestrator breaking down the task into sub-queries.
    3.  Live progress indicators show status of individual Queue consumers (e.g., cloning repo in Sandbox, Vectorizing code).
    4.  If `REVIEW_REQUIRED` state is hit, the UI surfaces a clear approval dialog (HITL).
    5.  Results are aggregated into a rich, structured dashboard instead of raw JSON.
*   **UX Focus:** Transparency of AI reasoning, clear loading states for long-running processes, and intuitive approval mechanisms.

### Journey B: Repository Flow Wizard
*   **Trigger:** User wants to retrofit CI/CD workflows across 5 repositories.
*   **Flow:**
    1.  User selects the "Retrofit Workflows" action.
    2.  Step 1: Select target repositories (multi-select list with search/filtering).
    3.  Step 2: Configure workflow parameters (yaml templates, secrets).
    4.  Step 3: Preview changes (diff view of proposed commits).
    5.  Step 4: Execute and monitor batch progress.
*   **UX Focus:** Error prevention, clear feedback on batch operations, and easy rollbacks if supported.

### Journey C: API Playground
*   **Trigger:** Developer needs to test a specific Octokit REST endpoint through the proxy.
*   **Flow:**
    1.  Developer navigates to the "API Explorer" tab.
    2.  Selects endpoint (e.g., `/api/octokit/rest/repos/get`).
    3.  Fills out JSON payload in a code editor component (e.g., Monaco Editor) with basic schema validation.
    4.  Clicks "Execute".
    5.  Views formatted JSON response, status code, and latency.
*   **UX Focus:** Familiarity (similar to Postman/Swagger), syntax highlighting, and quick copy-paste functionality.

## 5. UI/UX Component Requirements (Stitch Setup)
The frontend is built with React/Vite (as seen in `src/frontend`). The following components are required for the design system (e.g., Shadcn UI):

*   **Global Layout:** Sidebar navigation separating "Agent Orchestration", "Repository Flows", "Tools Explorer", and "Settings".
*   **Command Palette/Chat Interface:** A central input area for initiating agentic sessions.
*   **Status/Progress Indicators:** Crucial for long-running workflows. Must handle states: `PLANNING`, `RESEARCHING`, `REVIEW_REQUIRED`, `COMPLETED`, `ERROR`.
*   **Data Grids/Tables:** For listing repositories, workflow runs, and aggregated agent research results.
*   **Code/Diff Viewer:** Essential for previewing file upserts or workflow retrofits before execution.
*   **Toast Notifications/Error Handling:** Must follow the mandated Global Error Handling protocol. Errors caught by the frontend must be passed to handleGlobalError service, rendering a Sonner toast with the literal backend message and a "Copy for AI" button.

## 6. Error Handling Protocol (Critical Design Constraint)
The UI *must* implement the strict global error handling protocol defined in the backend architecture:
*   Do not use generic `<Alert>` blocks for structural logic failures.
*   Error toasts must explicitly display the transparent passthrough message from the backend (e.g., "GitHub API responded with 404 Not Found", not generic "Operation Failed").
*   Include a "Copy for AI" button on all error notifications to facilitate debugging.

## 7. Metrics for Success
*   **Task Completion Rate:** For repository flows (e.g., retrofitting).
*   **Time on Task:** How quickly a user can initiate and understand the results of an Agentic Research session.
*   **Error Recovery Rate:** How effectively users can copy an error, adjust their input, and retry successfully based on the transparent error toasts.

## 8. Next Steps for Design Team
1.  Review these requirements against the current backend Swagger/OpenAPI spec (`/openapi.json`).
2.  Produce low-fidelity wireframes for the three Key User Journeys.
3.  Develop a high-fidelity prototype focusing on the Agentic Research Console and its live WebSocket state updates.
