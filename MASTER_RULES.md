# MASTER_RULES.md

> **MANDATORY DIRECTIVE:** This document supercedes all legacy rule files and establishes the immutable architectural truths for the Google Antigravity IDE and Cloudflare Ecosystem workspace.

## 1. System Architecture & Stack
- **Environment:** Google Antigravity IDE.
- **Runtime:** Cloudflare Workers (workerd) with Unified Worker Assets.
- **Stack:** Astro 6 (Frontend host), React (Islands), Hono (API), Drizzle ORM (D1 Data Layer).
- **Package Manager:** Strict `pnpm`. Use `pnpm dlx wrangler@latest` / `pnpm exec`. Avoid `npx`. Use `--filter` for workspace commands.
- **Imports & Paths:** Absolute path aliases are mandatory (`@/*`, `@db/*`, `@api/*`, `@ui/*`, `@shared/*`). Never use relative traversal (`../../../`).
- **Global Types:** Rely on `Env` globally via `wrangler types` and `tsconfig.json`. Importing `Bindings` or `Env` manually is forbidden.
- **Agent Outputs:** You must ALWAYS generate full, complete, end-to-end code. Placeholders like `// rest of code` are strictly forbidden.

## 2. AI Agents & LLM Routing
- **Framework (Strict):** All stateful agents MUST extend `Agent`, `AIChatAgent`, or `McpAgent` from the `@cloudflare/agents` SDK. `honidev`, `HoniClient`, or raw DO `idFromName()` logic is explicitly forbidden.
- **Invocation & RPC:** Use `routeAgentRequest` at the Hono API boundary. Use `@callable()` for internal agent-to-agent RPC.
- **AI Gateway & Routing:** All AI calls must be routed via Cloudflare AI Gateway. Never hardcode endpoints; dynamically retrieve via `AIGateway.getBaseUrl()`.
- **Generation:** All LLM calls must use the `@/ai/providers` wrapper. Use `generateStructuredResponse` strictly for JSON output.
- **Separation of Concerns:** Agents act as Managers (state/decision). Heavy >10s tasks MUST be offloaded to Cloudflare Workflows (Workers).
- **Tooling:** MCP schemas must use strict Zod validation. Avoid Node.js-exclusive packages inside Sandbox/DO execution unless dynamically polyfilled via imports.

## 3. Database & D1 Governance
- **Strict Isolation:** Drizzle ORM, schema definitions, and migrations run EXCLUSIVELY in the backend. Frontends are strictly forbidden from importing `drizzle-orm` or DB drivers.
- **D1 Instance Routing:**
  - `DB`: For core application logic and system logs. Use `getDb(env.DB)`.
  - `DB_WEBHOOKS`: Exclusively for raw ingested GitHub events. Use `getWebhooksDb(env.DB_WEBHOOKS)`.
- **Schema & Migrations:** 
  - Use `integer('id').primaryKey({ autoIncrement: true })` for IDs.
  - DO state classes require `new_sqlite_classes` in migrations. Never manually write `.sql` migrations; use `drizzle-kit`.

## 4. API, Routing & WebSockets
- **Hono RPC:** All API interactions must use `hc` (Hono RPC) to share type definitions (`AppType`) safely with the frontend.
- **WebSocket Proxies:** Standardize all streaming/chat via `Get /api/agents/:agentName/:room` using `routeAgentRequest` to decouple UI from underlying DOs.
- **Frontend Routing Paradigm:** Adhere to Dual-Scope Routing:
  - Global scope routines at `/`.
  - Repo-specific views at `/repos/:owner/:repo/`.
- **API Spec:** Ensure compliant OpenAPI 3.1.0 usage via `@hono/zod-openapi` if REST is consumed by non-RPC clients.

## 5. Observability & Error Handling
- **Glass Box Logging (Backend):** Use the custom `Logger` class (`src/lib/logger.ts`) exclusively. String truncation (`.slice`, `.substring`) of error logs is completely forbidden. 
- **Persisted Logs:** Mirror all backend critical events to the `system_logs` D1 table. Always call `await logger.flush()` before execution exit.
- **Frontend Errors:** Use the global `handleGlobalError()` utility linked to standard Shadcn toasts. Never blindly mask or suppress API response failures in the UI.

## 6. UI & Frontend Standards
- **Framework Structure:** Astro `.astro` pages are the main routing host. All interactive components must be React islands (`client:load`, `client:visible`).
- **Aesthetic Core (Moody Modern):** Shadcn UI (Default Dark Theme) is mandatory. Tailwind CSS v4 via OKLCH color space. Hard set `<html class="dark">` (No light mode).
- **Layout Rule:** Mobile-first fluid responsiveness. Never use hardcoded pixel widths. Retrofit raw HTML/Tailwind wireframes immediately into Shadcn abstractions (e.g., `<Card>`, `<Button>`).
- **Standard UI Libraries:** 
  - Icons: `lucide-react`. 
  - Charts: `recharts` (Shadcn customized). 
  - Generative UI: `assistant-ui` bindings.

## 7. Infrastructure & Webhooks
- **JIT Auth (Zero-Touch):** Secrets are dynamically resolved by host OS `.zshrc` wrappers. NEVER manually inline `export CLOUDFLARE_API_TOKEN=...`, use pristine commands (`wrangler deploy`, `pnpm run ...`).
- **Platform Proxy:** The Astro frontend MUST set `platformProxy.configPath` exclusively to the root `wrangler.jsonc`.
- **Sandboxes:** Sandbox lifecycles are strictly ephemeral. State must be fully parsed and uploaded (D1/R2) before exiting the execution step. Treat `sandbox.exec()` strings as untrusted inputs.
- **Webhooks:** Use canonical webhooks validation to guarantee origin authenticity.
