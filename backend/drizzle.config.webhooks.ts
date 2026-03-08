import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: [
        "./backend/src/db/schemas/github/webhooks.ts",
        "./backend/src/db/schemas/logs/audit.ts",
        "./backend/src/db/schemas/webhooks/automations.ts"
    ],
    out: "./migrations/webhooks",
    dialect: "sqlite",
    driver: "d1-http",
});
