# AGENTS.md

## Cloudflare Bindings & Naming

1. **`script_name` vs `worker_name`**: The Cloudflare API often refers to the worker as `script_name`, but this is equivalent to the `name` field (the `worker_name`) defined in `wrangler.jsonc` or `wrangler.toml`.
2. **Bindings Management Philosophy**: The purpose of automated bindings management is **create-only**. The system should provision new resources (like a D1 database) in the Cloudflare account and then update the repository's `wrangler.jsonc` by submitting a GitHub PR or patching an existing one. The system is **NOT** responsible for attaching bindings to the worker via the Cloudflare API. Attaching bindings happens organically through the normal CI/CD deployment pipeline.

## Localized Agent Documentation (MANDATORY CRAWL)

This repository contains localized `AGENTS.md` and `AGENTS-REVIEW.md` files that dictate behavior for specific directories and domains. You **MUST** read the relevant localized file when working in its respective directory:

- [Frontend Repo Actions Review Protocol](src/frontend/src/components/repo-actions/AGENTS-REVIEW.md)
- [Backend AI Agents Architecture](src/backend/src/ai/agents/AGENTS.md)
- [Backend MCP Tools Protocol](src/backend/src/ai/mcp/tools/AGENTS.md)
- [General Documentation Guidelines](docs/AGENTS.md)
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

## Durable Object Abstraction (MANDATE)

To prevent type ambiguity and routing errors, raw Durable Object mounting (`idFromName`, `.get()`, raw `.fetch()`) is **strictly forbidden**.
- **Stateful AI Agents:** MUST be accessed via `HoniClient.getStub()` or `HoniClient.fetch()` (from `@utils/honi-client`).
- **WebSocket Broadcasters:** MUST be accessed via `BroadcastClient` (from `@utils/do-broadcast`).
For details, see `.agent/rules/02-do-abstraction.md`.

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

When modifying the Cloudflare Sandbox SDK (`@cloudflare/sandbox` or containers), follow these strict architectural and troubleshooting rules:

1. **Version Requirement**: Ensure that `package.json` SDK dependencies exactly match the tags in `container/Dockerfile` (e.g. `0.8.0`). Do not use `latest`.
2. **Verification**: Validated by `scripts/package/verify-sandbox-version.mjs` on `pnpm run deploy`. Mismatched versions invariably cause `500 Internal Server Error`.
3. **Container Base Image**: We use the native Cloudflare Sandbox images (merging `-opencode` into `-python`). **NEVER** overwrite the base image with `FROM oven/bun` or standard Node/Alpine images. Doing so destroys the Sandbox supervisor network and causes immediate crashes upon `sandbox.fetch()`.
4. **Lockfile Sync**: If the Docker build fails with `"lockfile is frozen"`, it means `container/bun.lockb` is out of sync. Standard fix: run `cd container && bun install` locally before deploying to synchronize the definitions.
5. **Port Exposure**: Any process running inside the container (e.g. `agent-sdk.ts` on port `3001`) MUST have a corresponding `EXPOSE 3001` directive in the Dockerfile for the host network proxy to recognize it.

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
2. **Frontend UI (Shadcn)**: The frontend must catch API errors and pass them to the centralized `handleGlobalError` service (in `@/lib/error-handler`), which renders a Sonner toast containing the literal backend message and a "Copy to Clipboard" button for the user to paste back to an AI agent. Do not use generic `<Alert>` blocks or raw `toast.error()` directly for structural logic failures. `handleGlobalError(error)` handles deduplication and dispatching metrics automatically.
3. **Transparent Passthrough**: Do not genericize trace messages on the backend. If an external service returns a 404, the JSON payload must contain `"error": "GitHub API responded with 404 Not Found"`, not `"Extraction failed"`.

## D1 & Drizzle ORM Governance (Mandatory)

### Table Instance Ownership

| D1 Binding | Purpose | Examples |
|-----------|---------|----------|
| `DB` (core) | All application tables | `system_logs`, `audit_logs`, `automation_logs`, `repos`, `prs`, `health_*`, `cloudflare_changelog`, everything not a raw webhook event |
| `DB_WEBHOOKS` | Raw GitHub webhook event data ONLY | `webhook_deliveries`, `pull_request`, `push`, `checkRun`, `workflow_run`, `webhook_configs`, `searches`, `repoAnalysis` |

### Pre-Table-Creation Scan (MANDATORY)

Before creating ANY new Drizzle table, you MUST:

1. Run: `grep -r "sqliteTable" src/backend/src/db/schemas/ --include="*.ts" -l` to list all schema files
2. Read the relevant domain's `index.ts` barrel and the table definitions
3. Ask: *"Can I add columns to an existing table instead of creating a new one?"*
4. Only create a new table if no existing table can reasonably serve the purpose
5. Assign the table to the correct D1 instance based on the ownership table above

### ORM Client Rules

- **DB (core)**: Always use `getDb(env.DB)` — imported from `@db`
- **DB_WEBHOOKS**: Always use `getWebhooksDb(env.DB_WEBHOOKS)` — imported from `@db`
- **NEVER** call `drizzle(env.DB)` or `drizzle(env.DB_WEBHOOKS)` directly — the schema argument is required

### Migration Discipline

- **NEVER** edit files in `migrations/core/` or `migrations/webhooks/` directly
- **ALWAYS** generate migrations via: `pnpm run db:generate:core` or `pnpm run db:generate:webhooks`
- **ALWAYS** apply via: `pnpm run migrate:remote:core` or `pnpm run migrate:remote:webhooks`
- Exception: if a migration fails and manual repair is explicitly authorized by the user
- To reset D1 from scratch: `pnpm run db:reset`

### Full Reset + Seed Protocol

`pnpm run db:reset` is **fully autonomous** — UUIDs are read from `wrangler.jsonc` automatically. No hardcoded constants to update.

After `db:reset` + deploy completes, restore prior data:
```bash
pnpm run db:seed:prep   # normalize exported data for D1 limits (truncates & chunks)
pnpm run db:seed:run    # apply seeds to fresh instances (bulk + per-statement fallback)
```

**⚠️ NEVER put seed files in `migrations/`** — place them only in `scripts/db/seeds/`.

### D1 Execution Limits (Reference)
| Limit | Value |
|-------|-------|
| Max bound parameters per query | 100 |
| Max SQL statement | 100 KB (scripts use 90 KB) |
| Max query duration | 30 seconds |
| Safe INSERT batch | 100 rows |
| Max D1 database size | 10 GB |

### D1 Health Monitors

Three health checks run automatically as part of `POST /api/health/run`:

| Check ID | Fails When |
|----------|-----------|
| `webhook_staleness` | `webhook_deliveries` empty OR >24h lag behind GitHub API OR >30 days since last delivery |
| `log_staleness` | `system_logs` empty OR latest entry >1 day old |
| `d1_table_scan` | Any table has 0 rows or last row >30 days old across both DB instances |

To manually verify D1 staleness:
```bash
# Quick row count
wrangler d1 execute DB --remote --command "SELECT count(*) FROM system_logs;"
wrangler d1 execute DB_WEBHOOKS --remote --command "SELECT count(*) FROM webhook_deliveries;"

# Full D1 health check (live API)
curl -X POST https://core-github-api.hacolby.workers.dev/api/health/run | \
  python3 -c "import sys, json; [print(r['name'], r['status'], '|', r['message'][:80]) for r in json.load(sys.stdin).get('results', []) if r['name'] in ['Webhook Staleness','Log Staleness','D1 Table Scan']]"
```

For the full D1 audit workflow, run: `/d1-audit`
See also: `.agent/rules/d1-drizzle-governance.md` | `.agent/workflows/d1-audit.md`

## GitHub Webhook Architecture (CRITICAL — READ BEFORE TOUCHING ROUTES)

> **See `.agent/rules/github-webhooks.md` for the full rule set.**

### Canonical Webhook URL (IMMUTABLE)

```
POST https://core-github-api.hacolby.workers.dev/api/webhooks
```

This URL is **hardcoded in the GitHub App settings** (GitHub Settings → Developer → Apps → core-github-api → Webhook URL).

| Property | Value |
|---|---|
| Route File | `src/backend/src/routes/api/webhooks/index.ts` |
| Route Mount | `src/backend/src/routes/index.ts` → `.route('/api/webhooks', webhooksApi)` |
| wrangler.jsonc var | `WEBHOOK_URL = "https://core-github-api.hacolby.workers.dev/api/webhooks"` |
| Health Check | `GET /api/health/github-app-webhooks` |

**DO NOT rename or move `/api/webhooks`**. Every GitHub event (push, PR, issue, check_run, etc.) from the `jmbish04` organization is delivered to this exact path. A path change without a simultaneous GitHub App settings update will cause silent data loss in `DB_WEBHOOKS`.

### Root Cause History (March 2026)

- ❌ **Old (wrong):** GitHub App was configured to POST to `/webhooks`
- ✅ **Fixed:** Corrected to `/api/webhooks` (the actual worker route prefix)
- ✅ **Result:** `DB_WEBHOOKS.webhook_deliveries` started receiving rows immediately after correction
- ✅ **Safeguard:** `WEBHOOK_URL` env var added to `wrangler.jsonc` as single source of truth

### Health Check for GitHub App Webhooks

The endpoint `GET /api/health/github-app-webhooks` authenticates as the GitHub App (JWT, not installation token) and:
1. Fetches the current webhook URL from GitHub App settings  
2. Compares it against `env.WEBHOOK_URL`  
3. Scans the 50 most recent deliveries for `status_code >= 400` failures
4. Returns `{ status: 'healthy' | 'degraded' | 'unhealthy', urlMatchesExpected, failedDeliveries }`

## Mobile-First Responsive Standard

All UI development within this ecosystem MUST prioritize fluid, mobile-responsive layouts. Our application shell (`Sidebar`) manages its own responsive off-canvas state via `useIsMobile`, but all internal page content (global views, repo-specific views, dashboards, etc.) must degrade gracefully on smaller viewports.

1. **Utility-First**: Utilize Tailwind CSS mobile-first breakpoints (e.g., default classes for mobile, shifting to `sm:`, `md:`, `lg:`, `xl:` for larger screens).
2. **Fluid Widths**: Never hardcode pixel widths for layout containers; use percentages or viewport units (e.g., `w-full md:w-1/2`).
3. **Stacked Layouts**: Grid and flex layouts must stack correctly on mobile (e.g., `flex-col md:flex-row`, `grid-cols-1 md:grid-cols-2`).
4. **Data Tables**: Wide data tables or complex elements must be wrapped in an `overflow-x-auto` container to prevent viewport breakage.
