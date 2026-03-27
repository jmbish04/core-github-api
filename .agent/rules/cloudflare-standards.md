# Cloudflare Worker Standards (2026)

- **Routing & Validation**: All APIs must exclusively utilize `Hono` alongside `@hono/zod-openapi` to enforce strict request schemas and automate documentation generation.
- **OpenAPI Enforcement**: Every Worker project must host `/openapi.json` (OpenAPI v3.1.0) and include a mounted `/scalar` and `/swagger` viewer UI.
- **AI Operations**: Standardize on the official `openai` SDK. Connections must be instantiated securely by configuring the `baseURL` to point directly to Cloudflare AI Gateway. 
- **Types & Configuration**: Environment typing is maintained strictly through `wrangler.jsonc` (not `wrangler.toml`), and synchronized via `wrangler types`. Manual mapping of types is deprecated.
