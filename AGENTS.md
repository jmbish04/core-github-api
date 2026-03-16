# AGENTS.md

# 🛑 AGENT REQUIRED READING 🛑

> **Protocol:** You are operating in a pnpm monorepo.
> **Verification:** Every time you run a command, ask yourself: "Am I using --filter?"
> **Instruction:** If you are unsure of the project structure, run `ls -R` or check the `pnpm-workspace.yaml`.

> **Golden Rule**: ALWAYS use the `@google/genai` SDK. NEVER use `@google/generative-ai`.

### PNPM Workspace Commands

This project is a pnpm monorepo with packages: `frontend` and `container`.

- **Installing Dependencies:** Never install dependencies at the root unless they are project-wide dev tools (e.g., turbo, prettier).
- **Targeted Install:** Use the `--filter` flag to target specific packages from the root:
  - Example: `pnpm add zod --filter frontend`
- **Root Install:** If a package _must_ go to the root, use the `-w` flag:
  - Example: `pnpm add -Dw typescript`
- **Internal Dependencies:** When adding one workspace package to another, use the `workspace:*` protocol.
  - Example: `pnpm add @workspace/common --filter frontend`

### State Management & Sync

- When updating schemas in `frontend/src/db`, ensure the backend remains the source of truth if shared.
- Always run `pnpm install` from the root after manual `package.json` edits to update the lockfile.

### 📦 PNPM Workspace Protocol

This repository is a pnpm monorepo.

- **Root Directory:** Contains the backend and global workspace commands.
- **Frontend Directory:** Contains the Astro/React/Shadcn application.

#### Installation Rules:

1. **Never** run `pnpm install <pkg>` at the root unless it is a workspace-wide dev tool (e.g., `turbo`, `prettier`).
2. **Targeted Install:** Always use the `--filter` flag from the root to add dependencies to specific packages.
   - ✅ Correct: `pnpm add zod --filter frontend`
   - ✅ Correct: `pnpm add drizzle-orm --filter frontend`
3. **CD Method:** Alternatively, `cd` into the package directory before running `pnpm add`.

#### Schema Sync:

- When modifying `schema.ts` or `validations.ts`, ensure they are placed in the directory where the Drizzle client is instantiated (currently `frontend/src/db`).
- After adding a dependency via the agent, always run `pnpm install` at the root to refresh the lockfile.

## Core Directives

1.  **SDK**: `import { GoogleGenAI } from "@google/genai";`
2.  **Instantiation**: `const ai = new GoogleGenAI({ apiKey: ... });`
3.  **Models**:
    - **General**: `gemini-2.5-flash` (or `gemini-2.0-flash-exp` if requested)
    - **Reasoning**: `gemini-2.0-flash-thinking-exp-1219` (if available) or `gemini-2.5-pro`
    - **Images**: `gemini-2.5-flash-image`
4.  **Configuration**: Pass `responseMimeType: "application/json"` and `responseSchema` for structured output.

## Package Management (PNPM Workspace)

Since this is a monorepo using `pnpm` workspaces, you **MUST** use specific flags when installing packages to avoid the `ERR_PNPM_ADDING_TO_ROOT` error by defaults.

- **Root Dependencies** (e.g., dev tools, shared types):
  ```bash
  pnpm add <package-name> -w
  ```
- **Workspace Requirements**:
  To install a package for a specific workspace (e.g., `frontend` or `backend`), use the `--filter` flag:
  ```bash
  pnpm add <package-name> --filter <workspace-name>
  ```

## Code Patterns

### ✅ Correct (New SDK)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const result = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  config: {
    responseMimeType: "application/json",
    // responseSchema: ... (Zod schema converted to JSON)
  },
});

console.log(result.text); // Getter, returns string
```

### ❌ Incorrect (Legacy/Deprecated)

- `require('@google/generative-ai')`
- `genai.getGenerativeModel(...)`
- `model.generateContent(...)` (Called on model instance instead of `ai.models`)
- `generationConfig` (Use `config` property instead)
- `result.response.text()` (Method call)

## Structured Outputs (MANDATE)

**CRYSTAL CLEAR RULE**: You MUST use `AiProvider.generateStructuredResponse` (or `generateStructuredWithTools` exported from `@/ai/providers`) _anytime_ the AI model is being instructed to respond with a structured JSON response.

**FORBIDDEN**: Do NOT rely on Agent SDK schema enforcements (e.g., passing `outputType: MySchema as any` to `@openai/agents`), as they are prone to brittle string extraction failures or 400 errors via the Cloudflare AI Gateway.

**Correct Pattern (Agent with Tools):**

1. Let the Agent execute its internal tool loop freely (returning markdown text).
2. Take the Agent's `result.finalOutput` and pass it into `generateStructuredResponse` along with your schema.

```typescript
import { generateStructuredResponse } from "@/ai/providers";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const MySchema = z.object({ ... });

// 1. Let agent run
const result = await runner.run(agent, prompt);

// 2. Extract strictly
const finalData = await generateStructuredResponse<z.infer<typeof MySchema>>(
  env,
  `Extract the exact data from the Agent's response:\n\n${result.finalOutput}`,
  zodToJsonSchema(MySchema as any, "structured_output")
);
```

## AI Provider Routing & Resolution

- **MANDATORY IMPORT PATH**: Agents must _always and exclusively_ import AI functions from `@/ai/providers`.
- **FORBIDDEN IMPORTS**: It is _never_ acceptable to import directly from specific provider files (e.g., `ai/providers/openai`, `ai/providers/gemini`) or the index file explicitly (e.g., `ai/providers/index`).
- **FUNCTION USAGE**: When using functions like `generateText`, `generateStructuredResponse`, etc., the agent should specify the `provider` and `model` arguments when known.
- **FALLBACK BEHAVIOR**:
  - If no provider or model is provided by the caller, the system relies on the `index.ts` routing to default to `workers-ai`, which then utilizes its internal business logic to select the correct fallback model.
  - Similarly, if a provider is specified but no model is provided, the specific provider module's logic determines the default model.
  - Agents should not hardcode default models unless explicitly required by the business logic.

## Full-Code Output Rule

Agents must never return elided or partial code using shortcuts such as:

- `// ... rest of the function remains the same ...`
- `// leaving as is`
- `// ... rest of code ...`

If a file is in scope, return the complete file content for that file. If a function is rewritten, return the full rewritten function. Do not replace omitted code with commentary.

## Tools (MCP)

When integrating tools:

1.  Use `src/lib/mcp.ts` to connect to Cloudflare Docs or other MCP servers.

## Container / Sandbox Protocol

When modifying the Cloudflare Sandbox SDK (`@cloudflare/sandbox` or containers), you **MUST** ensure the Docker base images exactly match the installed SDK version.

1. **Version Requirement**: Ensure that `package.json` SDK dependencies accurately match the versions in `container/Dockerfile`. Do not use `latest` as it introduces uncontrollable variables.
2. **Verification**: The primary deployment script (`pnpm run deploy`) natively executes `scripts/verify-sandbox-version.mjs` to protect against missing assets. The Cloudflare Workers container SDK checks version compatibility on startup: mismatched versions will invariably throw `500 Internal Server Errors` or immediate API crashes!

## Exit Criteria & Verification

Before reporting a task or turn as complete, you **MUST**:

1.  **Clear Linting Errors**: Ensure `bun run check` (or checking the IDE output) reveals no linting or compilation errors.
2.  **Verify Deployment**: Run `bun run dry-run` to validate the worker configuration and build process.
    - This executes `wrangler deploy --dry-run` to catch binding issues, bundle size limits, or config errors.
    - **Fix any errors** reported by this command before finishing.

# Antigravity Strategy: Agentic Research Team

## Context

We are deploying a dedicated **Agentic Research Team** consisting of a stateful Orchestrator (`ResearchAgent`) and durable execution pipelines (`DeepResearchWorkflow`). This system performs deep code analysis using Sandbox containers and Vectorize RAG, delivering findings via real-time WebSocket updates and daily email reports.

## Architectural Pillars

1.  **The Brain (Agents SDK)**: `ResearchAgent` maintains state, chat history, and HITL (Human-in-the-Loop) approvals.
2.  **The Muscle (Workflows)**: `DeepResearchWorkflow` handles long-running tasks (Cloning, Vectorizing) without timeout risks.
3.  **The Tools (MCP + Sandbox)**:
    - **Native MCP Adapter**: Adapts official GitHub MCP tool schemas to run on `octokit` within V8.
    - **Sandbox**: Ephemeral environments for `git clone` and code execution.
4.  **The Signal (Daily Discovery)**: Cron Trigger -> Workflow -> HTML Report -> Email.

## Task List

### Infrastructure & Configuration

- [ ] **Config**: Update `wrangler.jsonc` with bindings:
  - [ ] `kv_namespaces`: `AGENT_CACHE`
  - [ ] `vectorize_indexes`: `RESEARCH_INDEX` (Dimensions: 1024 for `@cf/baai/bge-large-en-v1.5`)
  - [ ] `ai`: `AI`
  - [ ] `workflows`: `DEEP_RESEARCH_WORKFLOW`
  - [ ] `send_email`: `EMAIL_SENDER`
  - [ ] `browser`: `BROWSER` (Sandbox assets)

### Component 1: MCP Integration (Native Adapter)

- [ ] **File**: `src/mcp/github-official-adapter.ts`
  - **Strategy**: Replicate the _schemas_ of the official `@modelcontextprotocol/server-github` but implement the _logic_ using your existing `src/octokit` client to ensure V8 compatibility.
  - **Registry**: Export these tools to the shared MCP toolkit (`src/mcp/index.ts`).

### Component 2: The Research Team

- [ ] **File**: `src/agents/ResearchAgent.ts` (The Manager)
  - **State Machine**: `PLANNING` -> `RESEARCHING` -> `REVIEW_REQUIRED` -> `COMPLETED`.
  - **Capabilities**: `runWorkflow`, `waitForEvent` (HITL), `getAgentByName`.
- [ ] **File**: `src/workflows/DeepResearchWorkflow.ts` (The Workers)
  - **Step 1**: `setup-sandbox`: Init Sandbox, `git clone`.
  - **Step 2**: `analysis-macro`: Run `ls -R`, tree, read `README`.
  - **Step 3**: `vectorize`: Chunk code, embed (Workers AI), upsert to `RESEARCH_INDEX`.
  - **Step 4**: `cleanup`: Destroy Sandbox.

### Component 3: Daily Discovery

- [ ] **File**: `src/schedulers/daily-scan.ts`
  - **Trigger**: Cron (e.g., 9 AM UTC).
  - **Logic**: Scans GitHub trending/new -> Triggers `DeepResearchWorkflow`.
  - **Report**: Generates HTML via LLM -> Sends via `env.EMAIL_SENDER`.

## Verification

1.  **MCP**: Verify tools `gh_official_search` and `gh_official_read` are available in the Agent's tool list.
2.  **Research**: Send "Analyze facebook/react" to `ResearchAgent`. Verify Workflow logs showing Sandbox clone.
3.  **Email**: Trigger cron manually via `npx wrangler triggers fire --name "daily-scan"`.

## Cross-Repository Architecture & Actions

- **Rule:** the `core-github-standardization` repository is the source of truth for CI/CD templates, heavy-lifting Python scripts, and global GitHub Actions.
- **Rule:** Any modification to an async task requires two PRs: One to `core-github-standardization` to update the python/yaml logic, and one to `core-github-api` to update the Zod schemas and D1 ingestion logic.

## Global Error Handling (Mandatory)

When handling exceptions across the stack, the following strict protocol MUST be followed:

1. **Backend Errors (D1 Mirror)**: All backend errors (API failures, tool exceptions) must be logged persistently using `src/lib/logger.ts`. You must invoke `logger.error()` passing the original error message and call `await logger.flush()` before returning the JSON error response to ensure the D1 `system_logs` transaction commits.
2. **Frontend UI (Shadcn)**: The frontend must catch API errors and pass them to the centralized `handleGlobalError` service (in `@/lib/error-handler`), which renders a Sonner toast containing the literal backend message and a "Copy to Clipboard" button for the user to paste back to an AI agent. Do not use generic `<Alert>` blocks for structural logic failures.
3. **Transparent Passthrough**: Do not genericize trace messages on the backend. If an external service returns a 404, the JSON payload must contain `"error": "GitHub API responded with 404 Not Found"`, not `"Extraction failed"`.
