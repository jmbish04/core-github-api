---
description: Enforces Zero-Touch Auth by auditing the codebase and agent memory (AGENTS.md, .agent/rules/). Strips manual inline secrets (CLOUDFLARE_API_TOKEN, GH_TOKEN) from scripts to ensure native integration with local JIT .zshrc wrappers.
---

# Workflow: Audit CLI Authentication Delegation

## Objective
Verify that the local codebase, environment scripts, and the agent's own instruction files strictly adhere to the Zero-Touch Authentication policy. The host `.zshrc` handles Just-In-Time (JIT) token injection. The agent must ensure no manual injection or exporting of `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, or `GH_TOKEN` exists anywhere in the project or its own memory.

## Execution Steps

### 1. Codebase & Script Audit
- Search all `package.json` scripts, `.sh` files, `.yml`/`.yaml` CI/CD configurations, and `Makefile`s for the following strings:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `GH_TOKEN`
- If any script is manually prefixing commands (e.g., `CLOUDFLARE_API_TOKEN=... wrangler deploy` or `export GH_TOKEN=...`), strip the variable assignment and leave only the standard base command (e.g., `wrangler deploy` or `gh pr create`).

### 2. Verify Agent Rules Directory
- Check for the existence of `.agent/rules/cli-auth-delegation.md`.
- If the file is missing, create it immediately and populate it with the strict directive forbidding inline secrets and manual exports for `wrangler`, `gh`, and package scripts. 

### 3. Verify AGENTS.md (Core Instructions)
- Read the root `AGENTS.md` file.
- Check if it contains explicit language regarding "Zero-Touch Auth" and the `.zshrc` JIT token wrappers.
- If the language is missing, append the following directive to the core instructions in `AGENTS.md`:
  > **Authentication Policy:** The host environment uses Just-In-Time (JIT) token wrappers via `.zshrc`. You must NEVER manually export or inline `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, or `GH_TOKEN` when generating deployment or Git commands. Always use standard invocations (e.g., `wrangler deploy`, `gh repo view`, `pnpm run deploy`). See `.agent/rules/cli-auth-delegation.md` for comprehensive details.

### 4. Report Findings & Self-Correction
- Output a summary to the user detailing exactly which files (if any) were modified to remove hardcoded tokens.
- Output a confirmation that `AGENTS.md` and `.agent/rules/cli-auth-delegation.md` are present, correct, and that the agent will cease all manual token injections for CLI commands moving forward.