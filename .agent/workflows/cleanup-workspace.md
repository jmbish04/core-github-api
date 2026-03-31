# Workflow: Workspace Context Optimization

## Context
Project Sentinel is experiencing context overflow. This workflow applies the Claude Code cleanup plan to optimize the Google Antigravity IDE environment.

## Steps
1. Create `.antigravityignore` at repo root with the optimized patterns.
2. Collapse `.agent/rules/000-bootstrap.md` and `.agent/rules/000-core-directive.md` into the new Genesis Directive.
3. Remove duplicate rule files:
   - `rm .agent/rules/ai-providers.md`
   - `rm .agent/rules/alerts.md`
   - `rm .agent/rules/cloudflare-stack.md`
4. Clean root-level artifacts:
   - `rm 20260330_tree.txt wrangler.log frontend-test-results.json`
   - `rm wrangler.jsonc.bak.*`
5. Trigger Re-indexing:
   - Run command `Antigravity: Restart Agent Service`
   - Run command `Antigravity: Refresh Index`
