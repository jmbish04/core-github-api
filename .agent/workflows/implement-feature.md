# .agent/workflows/implement-feature.md

# Implement BaseAgent-Powered Jules Overseer & Tiered Triage

## Context

We are refactoring the `JulesOverseer` to inherit from the newly established `BaseAgent` class. This provides the Overseer with immediate, native access to the `@cloudflare/mcp-server-cloudflare` without writing custom HTTP fetch loops. We are also formalizing the Tier 1 / Tier 2 delegation strategy in the SRE prompts.

## Execution Steps

1. **Update Prompts**
   - Inject the updated `HealthDiagnostician` prompt into the agent's definition, establishing the hard logic branch between SMALL fixes (execute internally via Octokit) and COMPLEX fixes (delegate to `JulesService`).

2. **Refactor `JulesOverseer.ts`**
   - Replace the file contents with the provided code.
   - Note the simplified `evaluateStuckJules` method. It now calls `await this.runTextWithModel({...})`, letting `BaseAgent` handle the model routing, the ReAct loop, and the Cloudflare MCP queries.
   - The method writes to the `alerts` table when `status === 'ready_for_pr'`.

3. **Verify Execution**
   - Ensure the `delegate_to_jules` tool in `HealthDiagnostician` sets `autoPr: false` so the job lands in the Overseer's queue.
   - When the chron triggers `/schedule/check`, verify via `wrangler tail` that the Overseer successfully pulls the stuck context, invokes `runTextWithModel`, and sends the generated strategy back to Jules via `julesService.sendMessage`.
