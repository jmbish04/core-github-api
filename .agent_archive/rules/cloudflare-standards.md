# Cloudflare Worker Standards (2026)

- **Routing & Validation**: All APIs must exclusively utilize `Hono` alongside `@hono/zod-openapi` to enforce strict request schemas and automate documentation generation.
- **OpenAPI Enforcement**: Every Worker project must host `/openapi.json` (OpenAPI v3.1.0) and include a mounted `/scalar` and `/swagger` viewer UI.
- **AI Operations**: Standardize on the official `openai` SDK. Connections must be instantiated securely by configuring the `baseURL` to point directly to Cloudflare AI Gateway. 
- **Types & Configuration**: Environment typing is maintained strictly through `wrangler.jsonc` (not `wrangler.toml`), and synchronized via `wrangler types`. Manual mapping of types is deprecated.

## Large Bundle Deployment Protections

When operating on Cloudflare Workers that exceed 5MB uncompressed:

1. Always enable `minify = true` in `wrangler.jsonc`.
2. Never rely on the default `wrangler deploy` CLI command directly if timeouts occur; wrap it in a Node script that overrides the `undici` global dispatcher timeout to at least 120,000ms.
3. Inject `NODE_OPTIONS=--max-old-space-size=8192` to prevent heap exhaustion during `esbuild` minification phases.
4. Ensure `compatibility_flags = ["nodejs_compat"]` is set and `node_compat = false` is enforced to prevent polyfill bloat.

## Cloudflare Bindings Philosophy

- **Naming Convention:** When interacting with the Cloudflare API, be aware that `script_name` refers to the `worker_name` defined in `wrangler.jsonc` or `wrangler.toml`.
- **Create & Patch Only:** The automated bindings manager is designed to **provision** resources (e.g., creating a D1 database) and **patch** the repository's `wrangler.jsonc` via a GitHub PR. 
- **No Direct Attachment:** Do **NOT** attempt to attach bindings directly to the Worker script via the Cloudflare API. The binding manager stops at PR creation, allowing the native CI/CD deployment pipeline to handle the actual attachment upon merge.
