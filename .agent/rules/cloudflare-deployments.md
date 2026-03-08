# .agent/rules/cloudflare-deployments.md

## Rule: Large Bundle Deployment Protections

When operating on Cloudflare Workers that exceed 5MB uncompressed:

1. Always enable `minify = true` in `wrangler.jsonc`.
2. Never rely on the default `wrangler deploy` CLI command directly if timeouts occur; wrap it in a Node script that overrides the `undici` global dispatcher timeout to at least 120,000ms.
3. Inject `NODE_OPTIONS=--max-old-space-size=8192` to prevent heap exhaustion during `esbuild` minification phases.
4. Ensure `compatibility_flags = ["nodejs_compat"]` is set and `node_compat = false` is enforced to prevent polyfill bloat.
