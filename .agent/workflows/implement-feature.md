# Implement Unified Action Gateway & Webhooks

## Objective

Establish a bi-directional integration between the `core-github-api` Cloudflare Worker and the `core-github-standardization` repository. This delegates heavy tasks (scraping, AI judging, template syncing) to a centralized GitHub Action, relying on async webhook callbacks to update D1 and broadcast via WebSockets.

## Steps

1. **Schema Definition:** Generate `./src/db/schemas/app/action_logs.ts` and run `drizzle-kit generate` to track task state.
2. **Outbound Dispatcher:** Implement `POST /api/actions/dispatch` using Hono and Zod. Ensure it constructs the standard `repository_dispatch` payload and writes a `pending` log to D1.
3. **Inbound Webhook:** Implement `POST /api/webhooks/action-callback`. Verify `X-API-Key`, update the D1 log to `success/error`, and route the payload to the respective D1 storage services (e.g., `daily_trends` table).
4. **Refactor Research:** Update existing deep research and awesome-stars sync services to utilize the new dispatch method instead of running inline.
5. **Documentation:** Write the cross-repository rules into `AGENTS.md` and `.agent/rules/` to ensure future modifications maintain parity across both codebases.
