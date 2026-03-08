# Architecture Rules: Discord API on Cloudflare Workers

## 1. Secrets Store Compliance

Cloudflare Secrets Store requires all account-level secrets to be fetched asynchronously.

- **Rule:** NEVER use synchronous mapping for Secret Store bindings.
- **Enforcement:** Always use `await env.BINDING_NAME.get()`.
- **Example:** `const token = await c.env.DISCORD_TOKEN.get();`

## 2. Discord Bot Search Constraints

Standard Discord Bot tokens cannot natively hit the `GET /guilds/{guild.id}/messages/search` API endpoint, as this is restricted to user contexts.

- **Rule:** When executing cross-channel or thread search tasks, the agent MUST implement a map-reduce pattern locally on the Worker.
- **Enforcement:** Fetch recent message batches from target channels/threads via `GET /channels/{id}/messages` and run local regex/string filtering to extract query matches.

## 3. OpenAPI Standard

All module expansions must utilize `@hono/zod-openapi` enforcing `openapi: 3.1.0`. Any newly added Discord interaction must map its return to a `z.object()` and expose it cleanly in the `/openapi.json` ledger.
