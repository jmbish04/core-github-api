import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: [
        "./backend/src/db/schemas/github/webhooks.ts"
    ],
    out: "./migrations/webhooks",
    dialect: "sqlite",
    driver: "d1-http",
});
