import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema-webhooks.ts",
    out: "./migrations/webhooks",
    dialect: "sqlite",
    driver: "d1-http",
});
