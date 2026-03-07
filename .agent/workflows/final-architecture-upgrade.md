# Workflow: Final Architecture Upgrade (KV, UI, Audit, Security)

Implement the complete dynamic configuration system. This involves moving configs to KV, building a Shadcn UI frontend with a sticky header and sidebar, creating a Drizzle-based audit trail in D1, and ensuring all sensitive data is masked before logging.

## Phase 1: Backend Core (KV & Config Manager)

1. **Create `src/lib/config.ts`**: Define the Zod `ConfigSchema` and implement the `ConfigManager` class for typed KV CRUD operations.
2. **Update `tsconfig.json`**: Add alias `"@/config-settings": ["./src/lib/config.ts"]`.
3. **Create `src/lib/masking.ts`**: Implement the `sanitizeForAudit` utility function to mask API keys.

## Phase 2: Database & Auditing (Drizzle & D1)

1. **Schema**: Create `src/db/schema.ts` defining the `config_audit_logs` table.
2. **Migration**: Run `drizzle-kit generate:sqlite` and `wrangler d1 migrations apply core-db --local` (or remote).

## Phase 3: API Layer (Hono)

1. **Create `src/routes/config.ts`**:
   - Implement `GET /` to fetch all configs via `ConfigManager`.
   - Implement `PATCH /` to update configs. This route MUST use `sanitizeForAudit` before inserting logs into D1.
   - Implement `GET /history` to fetch audit logs from D1.
2. **Register Route**: Mount `app.route("/api/config", configRouter)` in `src/index.ts`.
3. **Refactor Secrets**: Update `src/routes/secrets.ts` to use `await config.get("KEY", c.env.KEY)` fallback pattern.

## Phase 4: Frontend (Astro, React, Shadcn)

1. **Components**:
   - `Header.tsx`: Sticky, backdrop-blur, with a cog icon linking to `/config/general`.
   - `ConfigSidebar.tsx`: Sidebar navigation for config categories.
   - `ConfigTable.tsx`: Shadcn Table/Form for CRUD operations against the API.
   - `AuditTable.tsx`: Shadcn Table to display data from `/api/config/history`.
2. **Pages**:
   - `src/pages/config/[category].astro`: Dynamic route for config categories.
   - `src/pages/config/history.astro`: Page for viewing the audit trail.

## Antigravity Rules

- **Security**: NEVER log raw API keys to D1. Always use `sanitizeForAudit`.
- **UI**: Adhere to Shadcn "Default Dark" theme. Header must be sticky.
- **Pattern**: Always try KV first, then fallback to `c.env`.
