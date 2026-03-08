# Rule: Sandbox SDK Version Synchronization

## 1. Absolute Version Alignment

- When modifying the Cloudflare Sandbox SDK (`@cloudflare/sandbox` or containers), you **MUST** ensure the Docker base images exactly match the installed SDK version.
- **Forbidden**: Do not use `latest` as it introduces uncontrollable variables that lead to unpredictable execution panics.
- **Required**: Ensure that `package.json` SDK dependencies accurately match the versions in `container/Dockerfile`. (e.g., if package specifies `0.7.0`, then the Dockerfile must use `FROM docker.io/cloudflare/sandbox:0.7.0-python AS python-stage`, etc.).

## 2. Automated Validation Protocol

- The primary deployment script (`pnpm run deploy`) natively executes `scripts/verify-sandbox-version.mjs` to protect against missing assets.
- DO NOT bypass this script. The Cloudflare Workers container SDK checks version compatibility on startup: mismatched versions will invariably throw `500 Internal Server Errors` or immediate API crashes!

## 3. Upgrading the SDK

- To update the Sandbox SDK, you must update BOTH the package and the Docker layers simultaneously:
  1. Update `package.json`: `pnpm add @cloudflare/sandbox@<NEW_VERSION>`
  2. Edit `container/Dockerfile` to exactly match: `FROM docker.io/cloudflare/sandbox:<NEW_VERSION>`
- **Warning**: Running updates without syncing the Dockerfile will cause 500 errors in execution. Always run `node scripts/verify-sandbox-version.mjs` before pushing to production or triggering a deployment.
