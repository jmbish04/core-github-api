# .agent/workflows/implement-feature.md

# Enforce SDK Scheduling for Agents

## Context

We are refactoring agents that extend `BaseAgent` (`Supervisor`, `JulesOverseer`, etc.) to correctly utilize the `@cloudflare/agents` SDK `this.schedule()` method instead of relying on standard Durable Object alarms (`setAlarm`) or generic Worker `scheduled()` handlers.

## Execution Steps

1. **Refactor `Supervisor.ts`**
   - Replaced `this.ctx.storage.setAlarm(Date.now() + 60 * 1000);` with `await this.schedule(60, "watchdogCheck");`.
   - Implemented the `watchdogCheck()` method to handle the scheduled alarm check for container task status.

2. **Refactor `JulesOverseer.ts`**
   - Removed the worker-level `async scheduled(event: ScheduledEvent)` handler.
   - Initialized the schedule in `override async onStart()` using `await this.schedule(60 * 60, "checkJulesStatus");`.
   - Added `await this.schedule(60 * 60, "checkJulesStatus");` at the end of `checkJulesStatus` to ensure the task loops continuously.

3. **Verify Constraints**
   - Did not modify D1/SQLite primary keys on existing schemas to preserve state.
   - All code written is complete, containing no placeholders like `// leaving as is...`.
