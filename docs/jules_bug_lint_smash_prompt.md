# Jules Bug & Lint Smash Prompt

## Context

You are fixing TypeScript compilation errors (`tsc --noEmit`) in the `backend/` workspace of this monorepo. All errors are grouped by category below. Work through each group in order. Do not change git branches. Do not modify `frontend/`. Do not run `wrangler deploy`.

After fixing each group, run `pnpm tsc --noEmit --project backend/tsconfig.json` and verify the error count drops before moving to the next group.

---

## Group 1 — Missing / Deleted Source Files (TS2307 "Cannot find module")

These imports reference files that no longer exist. For each, either create a minimal stub that satisfies the import signature, or remove the dead import and its usages.

**Files to address:**

| File                                                                  | Missing module                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `backend/src/automations/issues/SlashCommand.ts`                      | `@/automations/push/gardener/router`                                          |
| `backend/src/automations/push/auditor.ts`                             | `./types`                                                                     |
| `backend/src/automations/push/commands/extract.ts`                    | `./types`                                                                     |
| `backend/src/automations/push/commands/registry.ts`                   | `./types`, `./fix-types`, `./fix-all`, `./resolve-conflicts`, `./implement`   |
| `backend/src/automations/push/commands/standardize.ts`                | `./types`                                                                     |
| `backend/src/automations/push/commands/test.ts`                       | `./types`, `../agents/implementer`                                            |
| `backend/src/automations/push/gardener/commands/fix-all.ts`           | `../ops/container-manager`                                                    |
| `backend/src/automations/push/gardener/commands/implement.ts`         | `../agents/implementer`                                                       |
| `backend/src/automations/push/gardener/commands/resolve-conflicts.ts` | `../ops/container-manager`                                                    |
| `backend/src/automations/push/GardenerPush.ts`                        | `@/automations/push/gardener`                                                 |
| `backend/src/automations/push/ops/container.ts`                       | `../types`                                                                    |
| `backend/src/automations/push/orchestrator.ts`                        | `./fixers/worker-type-fixer`, `./types`, `./RepoSpecialistBuilder`            |
| `backend/src/automations/push/router.ts`                              | `./types`                                                                     |
| `backend/src/automations/repository/standardization/rules.ts`         | `./octokit/core`                                                              |
| `backend/src/ai/agents/implementer.ts`                                | `../types`, `../router`, `../auditor`                                         |
| `backend/src/ai/agents/ResearchOrchestrator.ts`                       | `agents/workflows`                                                            |
| `backend/src/routes/api/ops/standards.ts`                             | `@services/standardization/mcp-sync`, `@services/standardization/secret-sync` |
| `backend/src/routes/rpc/service.ts`                                   | `@/ai/agents/utils`                                                           |
| `backend/src/services/standardization/index.ts`                       | `./agent-gen`, `./mcp-sync`, `./secret-sync`                                  |
| `backend/src/index.ts`                                                | `@scalar/hono-api-reference`, `agents/mcp`                                    |

**Fix strategy:**

- For `./types` stubs: create a `types.ts` in the same directory exporting the types the consuming file expects (check the usages for shape).
- For `agents/mcp` and `agents/workflows`: these are sub-path exports of the `agents` package. Check `node_modules/agents/package.json` exports map; if they don't exist, remove/replace the import with what _is_ available.
- For `@scalar/hono-api-reference`: install the package (`pnpm add @scalar/hono-api-reference --filter backend`) or remove the Scalar UI registration in `index.ts` if unused in production.
- For path-alias misses (`@services/...`, `@/ai/agents/utils`): verify `backend/tsconfig.json` `paths` entries and create the missing modules.

---

## Group 2 — `@openai/agents` Package Not Installed / Not Found (TS2307)

Multiple files import from `@openai/agents` which is either not installed or not in `package.json`.

**Affected files:**

- `backend/src/ai/agents/base/patterns/evaluator-optimizer.ts` (lines 1, 53)
- `backend/src/ai/agents/base/patterns/orchestrator-workers.ts` (line 49)
- `backend/src/ai/agents/base/patterns/parallelization.ts` (line 25)
- `backend/src/ai/agents/base/patterns/routing.ts` (line 36)
- `backend/src/ai/agents/ResearchOrchestrator.ts` (line 40)
- `backend/src/ai/providers/anthropic.ts` (line 16)
- `backend/src/ai/providers/gemini.ts` (line 16)
- `backend/src/ai/providers/openai.ts` (line 15)

**Fix strategy:**

1. Check if `@openai/agents` is in `backend/package.json`. If not, install it: `pnpm add @openai/agents --filter backend`.
2. If the package doesn't exist on npm or is a placeholder, replace its usage with the internal `agents` SDK equivalents already used in the project (`import { Agent } from 'agents'` etc.) and adapt the type signatures.

---

## Group 3 — Wrong Export Name from `agents` Package (TS2305)

The `agents` package does not export `getAgentByName` or `routeAgentRequest`. These names have changed.

**Affected files:**

- `backend/src/ai/agents/github/Repo.ts` (lines 8: `getAgentByName`, `routeAgentRequest`)
- `backend/src/ai/agents/health.ts` (line 2: `getAgentByName`)
- `backend/src/ai/agents/Orchestrator.ts` (line 12: `getAgentByName`)
- `backend/src/routes/api/agents/chat.ts` (line 9)
- `backend/src/routes/api/agents/cloudflare-chat.ts` (line 8)
- `backend/src/routes/api/agents/deep-research-chat.ts` (line 8)
- `backend/src/routes/api/agents/session.ts` (line 10)
- `backend/src/routes/api/agents/sessionStatus.ts` (line 10)
- `backend/src/routes/api/frontend/ai/chat.ts` (line 13)
- `backend/src/routes/api/frontend/workshop.ts` (line 4)

**Fix strategy:**
Run `pnpm dlx wrangler types` in the backend, then check `node_modules/agents/index.d.ts` for the correct export names. Common rename: `getAgentByName` → `getAgentByName` may not exist; the routing utility is typically `routeAgentRequest` from `agents`. If the SDK version changed, find the replacement and do a global search-and-replace.

---

## Group 4 — `Agent` / `handler` Not Exported from `honi` / Agent Module (TS2339)

Several agent files destructure `{ Agent, handler }` from a module that only exports a Durable Object shape.

**Affected files (all import `{ Agent, handler }` from a non-Honi source):**

- `backend/src/ai/agents/DeepReasoning.ts` (line 5)
- `backend/src/ai/agents/LandingPageAgent.ts` (line 26)
- `backend/src/ai/agents/Planner.ts` (line 17)
- `backend/src/ai/agents/Research.ts` (line 6)
- `backend/src/ai/agents/Supervisor.ts` (line 7)

**Fix strategy:**
These agents likely need to be refactored to use the **Honi V2 (honidev)** pattern (`createAgent` / `agentHandler`). Read the SKILL.md for `honi` in `.agent/skills/honi-agents/SKILL.md` for the correct import signature, then update each file to use the proper named exports.

Additionally, `TS2558: Expected 0 type arguments, but got 1` on the same lines means the type parameter is being passed where the new API doesn't accept one — remove the generic parameter.

---

## Group 5 — `setState` Does Not Exist, Should Be `setStatus` (TS2551)

Across multiple agents, `this.setState(...)` is called but the correct method is `this.setStatus(...)`.

**Affected files:**

- `backend/src/ai/agents/base/patterns/evaluator-optimizer.ts` (lines 73, 101, 105, 118)
- `backend/src/ai/agents/base/patterns/orchestrator-workers.ts` (lines 77, 101)
- `backend/src/ai/agents/github/Owner.ts` (lines 180, 184, 448)
- `backend/src/ai/agents/github/Repo.ts` (lines 305, 608)
- `backend/src/ai/agents/TopicOrchestrator.ts` (line 56)

**Fix strategy:**
Global search-and-replace `this.setState(` → `this.setStatus(` across `backend/src/ai/agents/`. Verify the argument shape still matches `setStatus` (it typically accepts a `string` status label).

---

## Group 6 — `this.env` / `this.ctx` / `this.logger` Does Not Exist on Class (TS2339)

These agents extend a base class but do not properly inherit or expose `env`, `ctx`, or `logger`.

**Affected files:**

- `backend/src/ai/agents/ResearchOrchestrator.ts` — `this.env` (many lines), `this.reportProgress`, `this.waitForApproval`
- `backend/src/ai/agents/Supervisor.ts` — `this.env`, `this.ctx`
- `backend/src/ai/agents/workshop/WorkshopAgent.ts` — `this.env`, `this.logger`

**Fix strategy:**

1. Verify each class correctly extends `BaseAgent<Env>` (or `HonoBaseAgent`).
2. If the base class exposes `env` via `this.env`, ensure the generic `TEnv` is bound properly in the subclass constructor.
3. For `this.reportProgress` / `this.waitForApproval`: these are custom methods — either they belong on the base class (add them) or they should be defined on `ResearchOrchestrator` itself (add the method stubs).
4. For `this.logger`: `WorkshopAgent` needs to either define a `logger` property or inherit it from `HonoBaseAgent`.

---

## Group 7 — `HonoBaseAgent` Is Not Generic (TS2315)

`HonoBaseAgent` is being used as a generic `HonoBaseAgent<SomeType>` but its class definition does not accept type parameters.

**Affected files:**

- `backend/src/ai/agents/CloudflareDocs.backup.ts` (line 176)
- `backend/src/ai/agents/workshop/WorkshopAgent.ts` (line 16)

**Fix strategy:**
Either add a generic type parameter to `HonoBaseAgent<TState extends BaseAgentState = BaseAgentState>` in `HonoBaseAgent.ts`, or remove the type argument at the usage sites and use the concrete state type directly.

---

## Group 8 — Unknown Properties on State / Config Objects (TS2353 / TS2561)

Object literals use properties that don't exist on the declared type.

**Affected files & issues:**

| File                                                 | Property      | Type                  | Fix                                                                                          |
| ---------------------------------------------------- | ------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `backend/src/ai/agents/CloudflareDocs.backup.ts:185` | `repoContext` | `BaseAgentState`      | Add `repoContext` to `BaseAgentState` or create a `CloudflareDocsAgentState` that extends it |
| `backend/src/ai/agents/CloudflareDocs.ts:67`         | `repoContext` | `BaseAgentState`      | Same as above                                                                                |
| `backend/src/ai/agents/workshop/CfAgentsSdk.ts:126`  | `repoContext` | `WorkshopAgentState`  | Add `repoContext` to `WorkshopAgentState`                                                    |
| `backend/src/ai/agents/Gemini.ts:12`                 | `dbBinding`   | `EpisodicConfig`      | Rename to `binding` (the correct property name per the error suggestion)                     |
| `backend/src/ai/agents/Gemini.ts:14`                 | `enabled`     | `ObservabilityConfig` | Remove `enabled` or check the correct config key for this type                               |

---

## Group 9 — `BaseAgent` Generic Env Constraints (TS2352 / TS2722)

`BaseAgent.ts` casts `TEnv` to `Record<string, { get?: () => Promise<string> }>` but `Env` lacks an index signature.

**File:** `backend/src/ai/agents/base/BaseAgent.ts` (lines 87, 90, 93, 113, 135)

**Fix strategy:**
Add an index signature to the `Env` type in `worker-configuration.d.ts`:

```ts
interface Env {
  [key: string]: unknown; // allow index access
  // ... existing bindings
}
```

Or constrain `TEnv` in `BaseAgent` to always include `[key: string]: unknown` via an intersection type. Also remove the stale `@ts-expect-error` on line 26 (TS2578 — the error it suppressed no longer exists).

---

## Group 10 — Cloudflare Request Type Mismatch (TS2345)

`Request<unknown, CfProperties<unknown>>` is not assignable to `Request<unknown, IncomingRequestCfProperties<unknown>>`.

**Affected files:**

- `backend/src/ai/agents/base/HonoBaseAgent.ts` (line 30)
- `backend/src/ai/agents/Gemini.ts` (line 24)

**Fix strategy:**
Cast the request when passing it to the base handler:

```ts
super.fetch(
  request as Request<unknown, IncomingRequestCfProperties<unknown>>,
  env,
  ctx,
);
```

Or update to use `ExecutionContext` properly. This is a Cloudflare types version skew — run `pnpm dlx wrangler types` to regenerate `worker-configuration.d.ts` and check if the types align after regeneration.

---

## Group 11 — `agents/mcp` MCP Tool Return Type Mismatch (TS2769 / TS2554)

In `backend/src/index.ts`, the MCP `server.tool(...)` callback returns `{ content: {} }` which is not a valid content array.

**File:** `backend/src/index.ts` (lines 60, 66, 85)

**Fix strategy:**

1. Change the tool callback return to use a proper content array:
   ```ts
   return { content: [{ type: "text", text: JSON.stringify(result) }] };
   ```
2. Fix line 66 — `server.tool()` requires 2–3 arguments but is being called with 1.
3. Fix line 85 — `SSEClientTransportOptions` does not have a `headers` field; remove it or use the correct option key.

---

## Group 12 — Miscellaneous / Isolated Errors

| File                                                               | Line   | Error                                                           | Fix                                                                                                       |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `backend/src/ai/agents/base/patterns/parallelization.ts:21`        | TS2315 | `Agent` is not generic                                          | Remove type argument: `Agent` → `Agent` (no `<T>`)                                                        |
| `backend/src/ai/agents/Supervisor.ts:35`                           | TS4112 | `override` on method in class with no parent                    | Remove `override` keyword from the method declaration, or make `Supervisor` extend the correct base class |
| `backend/src/ai/agents/Research.ts:28`                             | TS2554 | Constructor called with 4 args, expects 1                       | Match constructor signature                                                                               |
| `backend/src/ai/agents/Research.ts:34`                             | TS7006 | Implicit `any` on `params`, `ctx`                               | Add explicit types to callback params                                                                     |
| `backend/src/ai/agents/ResearchOrchestrator.ts:41`                 | TS2339 | `createRunner` not on `agent-ai`                                | Replace with correct export (check `agent-ai.ts` for available exports)                                   |
| `backend/src/ai/mcp/tools/github/git-sandbox-health.ts:83`         | TS2345 | `DurableObjectNamespace<undefined>` vs `<Sandbox<any>>`         | Cast: `env.SANDBOX as DurableObjectNamespace<Sandbox<any>>`                                               |
| `backend/src/ai/providers/*.ts`                                    | TS2724 | `createUniversalGatewayRunner` → `createUniversalGatewayClient` | Global rename in providers                                                                                |
| `backend/src/ai/agents/HealthDiagnostician.ts:59`                  | TS2722 | Possibly undefined invocation                                   | Add optional chaining `?.()` or null check                                                                |
| `backend/src/ai/agents/JulesOverseer.ts:43`                        | TS2722 | Same                                                            | Same fix                                                                                                  |
| `backend/src/routes/api/frontend/projects/planner.ts:19`           | TS2305 | `streamTextAgent` not exported from `agent-ai`                  | Check `agent-ai.ts` and use the correct export name                                                       |
| `backend/src/routes/api/frontend/research/research.ts:29`          | TS2339 | `submitBrief` on `DurableObjectStub<undefined>`                 | Bind the DO stub to the correct typed class                                                               |
| `backend/src/automations/push/commands/standardize.ts` / `test.ts` | TS7006 | Implicit `any` params                                           | Add explicit types based on the `CommandContext` or `CommandArgs` types expected                          |

---

## Completion Criteria

Run this after all fixes:

```bash
pnpm tsc --noEmit --project backend/tsconfig.json 2>&1 | grep "error TS" | wc -l
```

Target: **0 errors**.

If count is not 0, output the remaining errors grouped by file for a follow-up pass. Do not introduce `// @ts-ignore` suppressions — fix the actual types.
