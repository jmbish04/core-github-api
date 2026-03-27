# Rule: Sandbox SDK Version Synchronization & Container Architecture

## 1. Absolute Version Alignment
- When modifying the Cloudflare Sandbox SDK (`@cloudflare/sandbox` or containers), you **MUST** ensure the Docker base images exactly match the installed SDK version.
- **Forbidden**: Do not use `latest` as it introduces uncontrollable variables that lead to unpredictable execution panics.
- **Required**: Ensure that `package.json` SDK dependencies accurately match the versions in `container/Dockerfile`. (e.g., if package specifies `0.8.0`, then the Dockerfile must use `FROM docker.io/cloudflare/sandbox:0.8.0-python`, etc.).

## 2. Automated Validation Protocol
- The primary deployment script (`pnpm run deploy`) natively executes `scripts/package/verify-sandbox-version.mjs` to protect against missing assets.
- DO NOT bypass this script. The Cloudflare Workers container SDK checks version compatibility on startup: mismatched versions will invariably throw `500 Internal Server Errors` or immediate API crashes!

## 3. Upgrading the SDK
- To update the Sandbox SDK, you must update BOTH the package and the Docker layers simultaneously:
  1. Update `package.json`: `pnpm add @cloudflare/sandbox@<NEW_VERSION>`
  2. Edit `container/Dockerfile` to exactly match.
- **Warning**: Running updates without syncing the Dockerfile will cause 500 errors in execution. Always run `node scripts/package/verify-sandbox-version.mjs` before pushing to production or triggering a deployment.

## 4. Container Architecture & Dockerfile Patterns
- **Base Image Strategy**: We use the `-python` variant as the primary base image (`FROM docker.io/cloudflare/sandbox:<VERSION>-python`). This avoids Python path and module corruption by keeping the native OS environment intact.
- **Stage Merging**: We merge the `-opencode` assets (`/usr/local/lib/node_modules/opencode-ai`) into the Python base image to combine capabilities into a single unified container.
- **Never Replace the Base**: NEVER use `FROM oven/bun:1 AS base` or any alternate Linux base. Doing so overwrites the Cloudflare Sandbox runtime environment and breaks all internal SDK networking (`sandbox.fetch`, executable path tracking, etc.).

## 5. Troubleshooting Build Errors
- **`ENOENT package.json` / Layer Caching Issues**: Always copy `package.json` and `bun.lockb` into the container **before** running `bun install`.
- **`lockfile had changes, but lockfile is frozen`**: If `bun install --frozen-lockfile` fails during the container build, it means you added a dependency to `container/package.json` but forgot to run `bun install` locally. To fix:
  1. `cd container`
  2. `bun install` (to synchronize `bun.lockb`)
  3. Run deployment script again.
- **TypeScript Compilation Errors (`error TS2307: Cannot find module`)**: The container's `tsconfig.json` compiles `**/*.ts`. If you add new agents or imports (like `@anthropic-ai/claude-agent-sdk`), you must add them to `container/package.json` and run `bun install`.
- **EEXIST `bun`**: Don't run `npm install -g bun`. The cloudflare sandbox base images already have Bun pre-installed.
- **API Port Exposure**: If you are hosting custom HTTP servers inside the Sandbox (e.g. `agent-sdk.ts` on port 3001, or custom proxy), you MUST add an explicit `EXPOSE 3001` to the Dockerfile. Otherwise, the Cloudflare host networking won't route proxy traffic properly.
