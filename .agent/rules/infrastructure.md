# Infrastructure, Sandbox SDK & Discord

## 1. Sandbox SDK Version Synchronization
- **Absolute Version Alignment**: The base Docker image (`FROM docker.io/cloudflare/sandbox:<VERSION>-python`) MUST exactly match the `@cloudflare/sandbox` version in `package.json`. NEVER use `latest`.
- **Automated Validation**: `pnpm run deploy` natively executes `scripts/package/verify-sandbox-version.mjs`. Do NOT bypass this, as version mismatches cause 500 errors.
- **Architecture**: Always use the `-python` variant as the base image. Never overwrite the base Linux environment.
- **Troubleshooting**: If updating dependencies, ensure `bun.lockb` is updated by running `bun install` locally and within the `container/` folder. Expose custom ports with `EXPOSE 3001` in the Dockerfile if needed.

## 2. CLI Authentication Delegation (Zero-Touch Auth)
- **Context**: The host environment utilizes JIT token wrappers in `.zshrc` to inject `CLOUDFLARE_API_TOKEN` and `GH_TOKEN` securely per command.
- **Rule**: NEVER manually export or inline secrets in deployment scripts (e.g., `CLOUDFLARE_API_TOKEN=$MY_TOKEN pnpm run deploy` is FORBIDDEN). ALWAYS use the standard invocation (`wrangler deploy`, `pnpm run deploy`, `gh repo view`).

## 3. Discord on Cloudflare Workers
- **Secrets Store Compliance**: Cloudflare Secrets Store requires all account-level secrets to be fetched asynchronously (e.g., `await env.DISCORD_TOKEN.get()`). NOT synchronous mapping.
- **Search Constraints**: Discord bot tokens cannot directly hit the global search API. Cross-channel/thread search tasks MUST fetch recent messages via `GET /channels/{id}/messages` and implement map-reduce regex filtering locally on the Worker.
- **OpenAPI Standard**: Discord interaction endpoints must utilize `@hono/zod-openapi` and cleanly map their responses to a `z.object()` in `/openapi.json`.
