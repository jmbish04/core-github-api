---
description: Audit the entire codebase for mock/stub/hardcoded data and replace with real Drizzle schema + Hono/Zod REST or WebSocket API endpoints.
---

# Workflow: Mock Data Audit & Real Implementation

**Description:** Performs a codebase-wide sweep to locate hardcoded arrays, stubs, and mock stores, replacing them with production-grade Drizzle D1 schemas, `drizzle-zod` validators, and Hono REST/WebSocket routes. It dynamically maps your workspace structure to adapt to any repository layout.

## Step 1: Pre-Flight Analysis
1. Analyze the workspace package manager and root directory structure.
2. Read `wrangler.jsonc` (if present) to identify D1 database names, KV namespaces, and Durable Object bindings.
3. Dynamically locate the Drizzle schema file(s) (e.g., `src/db/schema.ts`, `packages/db/schema.ts`, or similar) to contextualize existing tables.
4. Locate the Hono root router file (e.g., `src/index.ts`, `app/server.ts`) to map the current routing tree.



## Step 2: Codebase Scan & Mock Registry Compilation
Run workspace-wide shell commands to locate mock data, explicitly ignoring `node_modules` and `.git`. Create a temporary registry in memory mapping `File | Lines | Type | Target Entity`.
1. **Arrays/Objects:** `grep -rnE "(const\s+\w+(List|Data|Items|Mock|Fake|Stub)\s*=\s*\[|\[\s*\{\s*(id|name)\s*:)" --exclude-dir={node_modules,.git,.wrangler} .`
2. **Hardcoded Strings:** `grep -rnE '"(TODO|FIXME|PLACEHOLDER|mock|fake|stub|test@)"' --exclude-dir={node_modules,.git,.wrangler} .`
3. **In-Memory Stores:** `grep -rnE "(const\s+\w+Store\s*=\s*new Map|const\s+\w+Cache\s*=\s*\{\})" --exclude-dir={node_modules,.git,.wrangler} .`
4. **State Initializers:** `grep -rn "useState(\[" --exclude-dir={node_modules,.git,.wrangler} .`
5. **Static Imports:** `find . -type d \( -name node_modules -o -name .git \) -prune -o \( -name "*.mock.ts" -o -name "*.fixture.ts" -o -name "fakeData.ts" \) -print`

## Step 3: Architecture & Schema Generation
For each mocked entity:
1. **Drizzle Table:** Append the new definition to the identified schema file (e.g., `src/db/schema.ts`).
   - Use `sqliteTable` from `drizzle-orm/sqlite-core`.
   - IDs must use `@paralleldrive/cuid2`.
   - Complex objects must use `text("...", { mode: "json" })`.
   - Dates must use `integer("...", { mode: "timestamp" })`.
2. **Validators:** Create or update the companion validators file (e.g., `src/db/validators.ts`).
   - Use `createInsertSchema` and `createSelectSchema` from `drizzle-zod`.
3. **Migration Execution:**
   - Run `pnpm run drizzle:generate` (Migrations must output to `./drizzle` in the database package/folder).
   - Run `pnpm run migrate:db` to apply changes.

## Step 4: Hono API Implementation
1. **Route Creation:** Create the route file (e.g., `src/routes/<entity>.ts`) implementing GET, POST, PATCH, DELETE.
   - Use `@hono/zod-validator` for endpoint input validation (targeting OpenAPI v3.1.0).
   - Use `drizzle-orm/d1` for database operations.
2. **WebSocket (if applicable):** Use `upgradeWebSocket` from `hono/cloudflare-workers` for real-time/event mocks.
3. **Mounting:** Register the route in the located Hono entrypoint (e.g., `src/index.ts`) and ensure it is exposed via the exported `AppType`.
4. **AI Routing:** Route any AI/LLM inferences via Cloudflare AI Gateway for multi-provider fallback.

## Step 5: Frontend Integration (React + Shadcn)
1. **State Migration:** Swap `useState(mockData)` in frontend files with `useQuery` or `useSWR` relying on the `hc<AppType>` Hono RPC client.
2. **Type Safety:** Use inferred types (e.g., `SelectMyEntity`) imported from the backend validators package.
3. **UI Polish:** Ensure loading and empty states utilize pixel-perfect Shadcn UI components (Default Dark Theme).
4. **Enums:** Replace hardcoded frontend options with Zod enum `.options` derived from the shared schema.

## Step 6: Cleanup & Validation
1. **Purge:** Delete all mock files identified in Step 2.
2. **Type Check:** Execute `tsc --noEmit` across all relevant workspaces.
3. **Verification:** Ensure the backend serves `/openapi.json`, `/swagger`, and `/scalar`, and the frontend maintains `/context`, `/docs`, and `/health`.
4. **Report:** Output a Post-Audit Summary detailing the exact paths of new tables, routes, and deleted files.