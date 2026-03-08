---
name: Create Specialist Agent
description: "Guidelines for implementing a new persona or specialist agent using the unified SpecialistAgent pattern and Workshop UI."
---

# Create Specialist Agent

When requested to create/incorporate a new expert agent (e.g. Data Scientist, UX Designer, Infrastructure Architect) into the Workshop, you MUST adhere to the following structure to maintain system cohesion.

## SPECIALIST INSTRUCTIONS

### 1. Frontend Architecture

- **WorkshopWizard.tsx** (or the corresponding wizard UI) is a large, stateful React component. Do not split it into too many tiny files initially; keep the logic cohesive in the `components/workshop/` directory.
- Use `framer-motion` (if available) or standard CSS transitions for step changes.
- **Chat**: Use `@cloudflare/ai-chat/react` hook (`useAgentChat`) for the "Consultation" step when interacting with the chosen expert.

### 2. The "Specialist" Pattern

- You are **NOT** creating 5 different ChatAgent classes (e.g. `DataArchitect.ts`, `FrontendExpert.ts`).
- Create **ONE** flexible `SpecialistAgent` class that extends `HonoBaseAgent`.
- When the frontend connects via RPC or WebSocket, it sends a `systemPrompt` or `specialty` parameter.
- The `SpecialistAgent` dynamically adopts the given persona (Data, UX, SRE) based on this parameter to construct its core context.
- Keep the system DRY. All standard tooling (like MCP lookup, GitHub file read, code search) is shared.

### 3. Registry & Discovery

- Add the new specialist configuration (name, description, required icon) to the `GET /api/agents/specialists` endpoint in `backend/src/routes/api/agents/specialists.ts`.
- The frontend (e.g., `AgentSidebar.tsx`) will automatically discover and list your new specialist without requiring UI hardcodes.

### 4. Plan Generation

- The output of the "Consultation" phase is a **JSON Plan**.
- The Agent should have a specific tool `save_plan(plan: JSON)` that writes the agreed-upon tasks to the `projects` table (or a linked `plans` table) in D1 using Drizzle ORM.
- This JSON is what eventually populates the Kanban board and drives downstream autonomous execution. Ensure the Zod schema for `save_plan` strictly enforces the expected task structure.
