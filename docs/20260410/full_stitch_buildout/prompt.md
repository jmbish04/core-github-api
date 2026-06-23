# Task: Stitch Service Modularization & Multi-Agent Integration (Via Staged Assets)

You are tasked with building out the Stitch orchestration service, the MCP tool definitions, and a 4-agent Jules integration. 

To prevent writing boilerplate from scratch, the `stitch-sdk` and `stitch-skills` repositories have been staged locally in `tmp/stitch-sdk/` and `tmp/stitch-skills/`. You MUST read from these directories, copy the relevant logic, and adapt it to our specific Cloudflare Worker architecture. 

**Do not write implementations from memory. Read the staged files first, then copy and modify.** Always output full, end-to-end code for any file you create or modify.

## Phase 1: Bootstrap the MCP Toolkit
**Target Directory:** `src/backend/src/ai/mcp/tools/stitch/`

Instead of writing Zod schemas and tool definitions by hand, utilize the generated SDK assets.
1. **Read and ingest:**
   - `tmp/stitch-sdk/packages/sdk/generated/tools-manifest.json`
   - `tmp/stitch-sdk/packages/sdk/generated/domain-map.json`
   - `tmp/stitch-sdk/packages/sdk/generated/src/tool-definitions.ts`
2. **Action:** Create the AI SDK and MCP tool wrappers in the target directory by directly mirroring the inputs/outputs defined in these staged files. Map them to our standard `tool()` (Vercel AI SDK) and `MCPTool` wrapper formats.

## Phase 2: Service Modularization (Copy & Wrap)
**Target Directory:** `src/backend/src/services/stitch/`

Refactor the Stitch service into a strict modular pattern (`index.ts`, `types.ts`, `health.ts`, and a `methods/` folder).
1. **Read the Reference Implementations:** Use the provided SDK examples as the core logic foundation for each method. Read:
   - `tmp/stitch-sdk/packages/sdk/examples/browse-designs.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/generate-screen.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/download-artifacts.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/edit-screen.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/get-screen.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/inspect-tools.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/list-tools.ts`
   - `tmp/stitch-sdk/packages/sdk/examples/retrieve-screen.ts`
2. **Action:** For each tool, create a dedicated file in `src/backend/src/services/stitch/methods/{method_name}.ts`. Copy the API invocation logic from the staged examples, but **wrap it** in our request-scoped singleton pattern that manages the MCP Client SSE connection lifecycle (handling Cloudflare Worker CPU time limits).
3. **Health Integration:** Implement `health.ts` to run unit tests against the worker, writing telemetry to D1 via Drizzle ORM.

## Phase 3: Multi-Agent Workflow Implementation
**Target Directory:** `src/backend/src/ai/workflows/` (or applicable router)

Implement the routing and system prompts for a 4-agent Jules integration. You must base their capabilities and prompts directly on the staged skills.
1. **Read the Staged Skills:**
   - `tmp/stitch-skills/skills/taste-design/`
   - `tmp/stitch-skills/skills/stitch-design/`
   - `tmp/stitch-skills/skills/design-md/`
   - `tmp/stitch-skills/skills/stitch-loop/`
2. **DesignAgent (The Architect):** Adapt the `taste-design`, `stitch-design`, and `design-md` skills. Configure it to brainstorm user journeys based on the repo's OpenAPI spec, generate `DESIGN.md` (enforcing default dark theme Shadcn responsive components), create the Stitch project, and orchestrate Stitch screen generation alongside the GuardrailsAgent.
3. **OrchestrationAgent (The Conductor):** Implement the `stitch-loop` skill, managing the `.stitch/next-prompt.md` baton-passing system to hand off approved designs to the Engineer.
4. **EngineerAgent & GuardrailsAgent (The Builders):** Implement the Jules build session stream. The Engineer reads the Stitch HTML (never passing it raw to Jules) and writes a build prompt enforcing `npx shadcn@latest apply`. The GuardrailsAgent intercepts and appends architectural guardrails before submission, and monitors the Jules SSE stream to issue real-time course corrections.

## Strict Architectural Requirements
- **Routing:** Use Hono `^4.12.4` for all backend routes (mitigating the recent `serveStatic` CVE).
- **Database:** D1 interactions must use Drizzle ORM with migrations in `./drizzle`.
- **Validation:** Favor `Zod` for all schemas.
- **AI Integration:** Route through Cloudflare AI Gateway. STRICTLY use Vercel AI SDK/chat completions (do not use the deprecating OpenAI Assistants API).