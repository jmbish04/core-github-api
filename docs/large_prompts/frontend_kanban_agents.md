OK please proceed with the workflow enhancements (wizard & pr command center) for the UI to trigger these powerful new agents. In addition, please also incporate the frontend components (and drizzle schema, reminder drizzle and ORM -- no raw sql) as well - this is diceui which are expandable shadcn components so it should play nice with the frrontend 

The **Colby Control Center** is shaping up to be a powerhouse. Integrating `@diceui/kanban` (for backlog/task management), `@diceui/stat` (for health scores), and `@diceui/timeline` (for visualizing agent thought processes) will elevate the UX from a simple admin panel to a true mission control.

Here is the updated prompt package for your AI agent. It includes the Drizzle schema changes to support these new features and the instructions for integrating the Dice UI components.

-----

### 🖥️ Prompt for AI Agent: Colby Control Center (Dice UI Edition)

**System Role:**
You are a Senior Frontend Architect and Full-Stack Engineer. You are building "Colby Control Center," the mission control dashboard for an autonomous DevOps agent.

**Objective:**
Enhance the dashboard with rich data visualization and task management capabilities using **Shadcn UI** and **Dice UI**. The backend (Cloudflare Worker) must support persistent storage for these features.

**Tech Stack Additions:**

  * **Frontend:** `@diceui/kanban`, `@diceui/stat`, `@diceui/timeline`.
  * **Backend:** Drizzle ORM (D1 Database).

**Part 1: Database Schema (Drizzle)**
Create a new migration file `migrations/0017_project_management.sql` and update `src/db/schema.ts` to include these tables:

1.  **`tasks` (Kanban Board)**

      * `id`: TEXT (UUID)
      * `repo_id`: INTEGER (Foreign Key to `repos.id`)
      * `title`: TEXT
      * `description`: TEXT (Markdown)
      * `status`: TEXT (Enum: 'backlog', 'todo', 'in-progress', 'review', 'done')
      * `priority`: TEXT (Enum: 'low', 'medium', 'high', 'critical')
      * `assignee`: TEXT (GitHub Username or 'colby-bot')
      * `created_at`: TIMESTAMP
      * `updated_at`: TIMESTAMP
      * `position`: INTEGER (For drag-and-drop ordering)

2.  **`agent_activities` (Timeline)**

      * `id`: TEXT (UUID)
      * `operation_id`: TEXT (Links to `operation_logs`)
      * `step_name`: TEXT (e.g., "Analyzing Dependencies")
      * `status`: TEXT ('pending', 'active', 'completed', 'failed')
      * `details`: TEXT (JSON string for extra context)
      * `timestamp`: TIMESTAMP

3.  **`repo_stats` (Stats Cards)**

      * `repo_id`: INTEGER
      * `health_score`: INTEGER (0-100)
      * `open_issues_count`: INTEGER
      * `prs_merged_this_week`: INTEGER
      * `last_updated`: TIMESTAMP

**Part 2: Frontend Components (Dice UI Integration)**

**A. The "Task Board" (Kanban)**

  * **Component:** `components/ProjectBoard.tsx`
  * **Library:** `@diceui/kanban` (plus `@dnd-kit/core` deps).
  * **Features:**
      * Columns: Backlog | To Do | In Progress | Done.
      * **Drag & Drop:** Moving a card updates the `status` and `position` via an API call (`PATCH /api/tasks/:id`).
      * **"Colby Tasks":** Highlight cards assigned to 'colby-bot' with a special badge. These represent active agent jobs (like "Fix Types").

**B. The "Mission Status" (Stats)**

  * **Component:** `components/RepoHealthCard.tsx`
  * **Library:** `@diceui/stat`
  * **Usage:**
      * Display "Repo Health" (0-100%) with a color-coded indicator (Green \> 80, Red \< 50).
      * Display "Pending Fixes" count.
      * Display "Agent Activity" trend (Up/Down arrow).

**C. The "Agent Brain" (Timeline)**

  * **Component:** `components/AgentWorkflowTimeline.tsx`
  * **Library:** `@diceui/timeline`
  * **Context:** Use this inside the **PR Command Center** and **Live Ops Console**.
  * **Behavior:**
      * Polls `/api/ops/:id/timeline`.
      * Renders a vertical timeline of the agent's steps.
      * **Active Step:** Pulses or shows a loading spinner.
      * **Completed Steps:** Shows a green checkmark.
      * **Failed Steps:** Red 'X' with a collapsible error log.

**Part 3: API Endpoints (Hono)**
Update `src/index.ts` to expose these new data points:

  * `GET /api/repos/:owner/:repo/tasks`: Fetch kanban items.
  * `PATCH /api/tasks/:id`: Update status/position (for drag-and-drop).
  * `GET /api/repos/:owner/:repo/stats`: Calculate and return health metrics.
  * `GET /api/ops/:operationId/timeline`: Return the structured log of agent steps for the timeline view.

**Instructions:**

1.  Generate the SQL migration.
2.  Create the Drizzle schema definitions.
3.  Scaffold the React components using the provided Dice UI examples as a template.
4.  Implement the API routes to feed data to these components.

-----

### 🧠 Strategic Insight for the "Agent Brain" Timeline

When the agent runs a complex task (like `/colby fix all`), you should have it **emit timeline events** explicitly.

In your `container/src/task_runner.ts` (or wherever the logic lives), add a helper function:

```typescript
// Helper to push timeline updates to the Worker
async function emitStep(stepName: string, status: 'active' | 'completed' | 'failed', details?: string) {
  await fetch(`${process.env.COLBY_API_URL}/api/ops/${process.env.OPERATION_ID}/timeline`, {
    method: 'POST',
    body: JSON.stringify({ step: stepName, status, details })
  });
}

// Usage in task
await emitStep("Cloning Repository", "active");
execSync("git clone ...");
await emitStep("Cloning Repository", "completed");

await emitStep("Analyzing Code", "active");
// ... AI logic ...
await emitStep("Analyzing Code", "completed", "Found 3 files to fix.");
```

This connects the **Container's brain** directly to the **Frontend's visual timeline**, giving you that satisfying "step-by-step" progress view.




