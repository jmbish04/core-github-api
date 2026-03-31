# Workflow: Refactor core-github-api Backend to Hono + OpenAPI

1. **Workspace Integration**:
   - Navigate to the `core-github-api` directory.
   - Update `package.json` to include all required Hono, Zod, and Sandbox SDK dependencies. Run `npm install`.
   - Update the existing `wrangler.jsonc` to point the `main` entry to `src/backend/index.ts` and define the `Sandbox` Durable Object bindings and migrations.
2. **Refactor Backend**:
   - Replace the contents of `src/backend/index.ts` with the unified application code provided.
   - Verify that `export { Sandbox } from '@cloudflare/sandbox';` remains at the top level to satisfy Durable Object class binding constraints.
3. **Environment & Types**:
   - Ensure `.dev.vars` contains `GITHUB_TOKEN`, `OPENAI_API_KEY`, `WEBHOOK_SECRET`, and `AI_GATEWAY_URL`.
   - Run `npm run cf-typegen` (`wrangler types --env-interface Env`) to sync dynamic type definitions.
4. **Validation Phase**:
   - Serve application locally via `npm run dev`.
   - Navigate to `http://localhost:8787/scalar` to verify the OpenAPI v3.1.0 specification mounts correctly.
   - Run a payload simulation for the `/api/execute` endpoint through the Scalar UI to confirm Sandbox provisioning, Python execution, and output retrieval.
