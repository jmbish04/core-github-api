import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./backend/src/db/schema.ts",
    out: "./migrations/core",
    dialect: "sqlite",
    driver: "d1-http",
});
