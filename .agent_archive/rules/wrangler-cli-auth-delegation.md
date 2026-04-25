---
trigger: always_on
---

# Rule: CLI Authentication Delegation (Zero-Touch Auth)

## Context
The host environment utilizes custom Just-In-Time (JIT) token wrappers in `.zshrc` that automatically intercept specific CLI tools (e.g., `wrangler`, `gh`). These wrappers dynamically fetch secrets (like `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `GH_TOKEN`) and inject them into the execution context for that single command. 

## Directives
1. **NEVER export secrets manually:** Do not generate commands that use `export CLOUDFLARE_API_TOKEN=...` or `export GH_TOKEN=...` before executing a script.
2. **NEVER inline secrets:** Do not prepend environment variables to deployment or CLI commands. 
    * ❌ **INCORRECT:** `CLOUDFLARE_API_TOKEN=your_token wrangler deploy`
    * ❌ **INCORRECT:** `GH_TOKEN=your_token gh pr create`
    * ❌ **INCORRECT:** `CLOUDFLARE_API_TOKEN=$MY_TOKEN pnpm run deploy`
3. **USE standard invocations:** Always generate the simplest, standard invocation for the CLI tool or package script. Assume the host environment handles authentication transparently.
    * ✅ **CORRECT:** `wrangler deploy`
    * ✅ **CORRECT:** `pnpm run deploy`
    * ✅ **CORRECT:** `gh repo view`
4. **NO Auth Flags:** Do not attempt to pass tokens via command-line arguments or flags (e.g., avoid `--token`, `--auth`, etc.) unless specifically requested by the user for a novel CLI tool that lacks a `.zshrc` wrapper.