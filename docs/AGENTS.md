# AGENTS.md

## 🤖 Welcome, AI Agent!

This document provides instructions for extending and maintaining the Cloudflare Worker GitHub Proxy.

### Core Principles

1.  **Modularity**: Keep features self-contained. Each GitHub API or tool should have its own file.
2.  **Schema-Driven**: Use Zod for all input and output validation. The OpenAPI spec is generated from these schemas.
3.  **Self-Documenting**: Every file needs a docstring. Every complex function needs inline comments.

### How to Extend the API

**Adding a new REST endpoint:**

1.  Find the appropriate namespace file in `src/octokit/rest/`.
2.  Add a new Hono route handler.
3.  Define Zod schemas for the request and response.
4.  Use `@hono/zod-openapi` to register the route with OpenAPI.
5.  Call the corresponding `@octokit/rest` method.

**Adding a new Tool:**

1.  Create a new file in `src/tools/`.
2.  Define the business logic for the tool.
3.  Expose it as a Hono route, following the schema-driven principles above.
4.  Add `x-agent: true` to the OpenAPI metadata for the route.

### Pre-commit Checks

Before submitting your changes, ensure that:

1.  `npm install` has been run.
2.  `wrangler dev` starts without errors.
3.  The `/openapi.json` endpoint is up-to-date and valid.
4.  You have added or updated documentation as needed.

### Database & Drizzle ORM Guidelines

**CRITICAL RULE**: ALWAYS use Drizzle ORM for schema definitions, migrations, and queries. NEVER manually write SQL migrations or modify the database directly unless absolutely necessary for complex performance tuning.

1.  **Strict Drizzle Usage**:
    *   Define all schemas in `src/db/schema-*.ts`.
    *   Use `npm run db:generate:*` to create SQL migrations.
    *   Use `npm run migrate:*` to apply them.
    *   Do NOT edit `.sql` migration files manually.

2.  **Database Bindings**:
    *   **`DB` (Core)**: Holds business logic data (Repositories, Reviews, User Data).
        *   Binding: `env.DB`
        *   Schema: `src/db/schema.ts` (aggregates `schema-repos.ts`, `schema-reviews.ts`)
    *   **`DB_WEBHOOKS` (Events)**: Holds high-volume raw webhook events.
        *   Binding: `env.DB_WEBHOOKS`
        *   Schema: `src/db/schema-webhooks.ts`

3.  **Naming Conventions**:
    *   Use `camelCase` for TypeScript property names (e.g., `repoUrl`).
    *   Use `snake_case` for database column names (e.g., `repo_url`).
    *   Example: `repoUrl: text("repo_url").notNull()`

4.  **Best Practices (from Cloudflare Docs)**:
    *   **Migrations**: Always test migrations locally (`migrate:local`) before remote.
    *   **Batching**: Use batch inserts/updates when dealing with multiple records to reduce round-trips.
    *   **Indexes**: Define indexes in the schema for frequently queried columns (e.g., `delivery_id`, `repo_id`).
