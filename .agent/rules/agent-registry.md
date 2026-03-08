# Rule: Agent Registry and Dynamic UI

## 1. Dynamic UI Consumption

- Frontend agent selectors, wizards, and sidebars (e.g., `AgentSidebar.tsx`) **MUST NEVER** hardcode the list of available specialist agents.
- All dynamic agent discovery must occur via the `GET /api/agents/specialists` REST endpoint. This ensures the backend remains the single source of truth for agent capabilities, routing, and availability.

## 2. The Specialist Pattern

- Avoid creating numerous bespoke subclasses of `HonoBaseAgent` (e.g., `DataAgent`, `UXAgent`, `SREAgent`) unless they require fundamentally distinct toolsets or event lifecycles.
- Default to using **ONE** flexible `SpecialistAgent` class.
- Dictate the specific persona dynamically at runtime by overriding the `systemPrompt` or passing a `specialty` configuration parameter when the frontend initiates the session.
- **Why?** This prevents sprawling class files, keeps the agent execution logic DRY, and enables the system to spin up arbitrary expert subsets without code deployments.

## 3. Plan Generation Output

- The ultimate goal of a Workshop or Consultation flow is actionable output.
- Specialist Agents should be equipped with a `save_plan(plan: JSON)` tool.
- When the agent and user align on a roadmap, the agent must invoke `save_plan` to persist the structured JSON to the `projects`, `plans`, or `todos` table via Drizzle.
- The UI should then react to this database mutation (e.g., by advancing the Wizard, redirecting to the Kanban board, or pushing a toast).
