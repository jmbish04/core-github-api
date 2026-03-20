/**
 * @file drizzle.do.config.ts
 * @description Drizzle-Kit configuration for Durable Object (DO) SQLite migrations.
 * Separate from the main D1 config because DOs use the `durable-sqlite` dialect driver.
 * Migrations generated here are bundled and applied via `migrate()` inside each DO constructor.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/backend/src/db/schemas/agents/events.ts",
  out: "./migrations/do",
  dialect: "sqlite",
});
