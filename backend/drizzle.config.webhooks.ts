import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: [
        "./backend/src/db/schema-webhooks.ts",
        "./backend/src/db/schema-research.ts",
        "./backend/src/db/schema-research-orchestrator.ts"
    ],
    out: "./migrations/webhooks",
    dialect: "sqlite",
    driver: "d1-http",
});
