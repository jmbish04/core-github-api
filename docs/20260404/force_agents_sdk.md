> 🤖 **ROLE:** Lead Architect

This implementation plan is approved. You have perfectly grasped the new architectural directives.

Phase 2 (`routeAgentRequest` in the Hono router) is exactly what we need to safely upgrade the `assistant-ui` WebSockets and bypass the standard 30-second Worker HTTP timeouts, resolving the Error 1102 bugs.

Please proceed with executing Phases 2, 3, 4, and 5.

**CRITICAL REQUIREMENTS FOR CODE GENERATION:**

1. You must provide the **COMPLETE, UN-TRUNCATED** code for every file you modify.
2. Do not use placeholders, shortcuts, or comments like `// ... rest of code ...`. I need to be able to copy-paste your output directly into my IDE with zero manual stitching.
3. You must use try/catch handling everywhere in combination with the src/backend/src/lib/logger.ts class on the backend and [src/frontend/src/lib/success-handler.ts and src/frontend/src/lib/error-handler.ts] on the frontend. 
  3.1 DO NOT UNDER ANY CIRCUMSTANCES LEAVE CATCH LIKE THIS `catch { /* ignore */ }` ... the catch must always look like this ```typescript
  import { Logger } from "@/lib/logger";
      const logger = new Logger(env, 'Gemini');
    logger.info('Initializing SDK client');
    ```
3. Ensure the Hono router (`src/backend/src/index.ts` or wherever the main routing occurs) includes the `routeAgentRequest` middleware exactly as planned.
4. Delete and remove dependenies to `src/frontend/src/views/control/global/useHoniChatRuntime.ts` (or the relevant frontend file) and use native cloudflare agents sdk instead. Ask cloudflare docs mcp for clarification here. 

Output the code blocks now.

here is the approved integration plan:

````markdown
# Antigravity Implementation Plan: Agent SDK Migration & DO Abstraction Fix

## Context

The legacy `HoniClient` wrapper and raw `idFromName` calls are causing Error 1102 (Worker exceeded resource limits) during long LLM generations because the wrapper fails to properly stream/upgrade WebSocket connections. The updated `.agent/rules/02-do-abstraction.md` now mandates:

- **`routeAgentRequest`** from the `agents` package at the Hono boundary for HTTP/WS traffic
- **`getAgentByName`** from the `agents` package for internal RPC between agents
- **`BroadcastClient`** retained ONLY for non-agent WebSocket broadcasters (e.g., `JulesWebhookBroadcaster`)
- **`HoniClient`** is deprecated for Agent classes

### Key Architecture Discovery

- **`LearningAgent`** already extends `Agent` from `agents` package — fully SDK-compatible
- **`JudgeAgent`**, **`JulesOverseer`**, and other Honi-based agents extend `createAgent()` DurableObjects with a `fetch()` handler — `routeAgentRequest` can route to them since it just resolves `idFromName` + forwards the request
- **Frontend** connects via WebSocket to `/agents/{agentName}/{sessionId}` — this is exactly the URL pattern `routeAgentRequest` expects
- **`@cloudflare/ai-chat`** is an optional peer dep of `agents` (not installed). The `useAgent` hook from `agents/react` is available and installed in the frontend (`agents: ^0.7.0`)

### Violation Summary (8 files)

| File                   | Violation                            | Fix                                                 |
| ---------------------- | ------------------------------------ | --------------------------------------------------- |
| `sentinel/types.ts`    | Raw broadcaster DO                   | → `BroadcastClient.broadcast()`                     |
| `sentinel/ws.ts`       | Raw broadcaster DO                   | → `BroadcastClient.upgradeWebSocket()`              |
| `sentinel/clarify.ts`  | Raw broadcaster + raw JULES_OVERSEER | → `BroadcastClient` + `getAgentByName`              |
| `SentinelPostMerge.ts` | Raw DO + wrong name `"default"`      | → `getAgentByName` + fix name to `'learning-agent'` |
| `ingestor.ts`          | Raw LEARNING_AGENT DO                | → `getAgentByName`                                  |
| `LearningWorkflow.ts`  | Raw LEARNING_AGENT DO                | → `getAgentByName`                                  |
| `governance/index.ts`  | Raw LEARNING_AGENT DO                | → `getAgentByName`                                  |
| `sentinel/tasks.ts`    | Raw JUDGE_AGENT DO                   | → `getAgentByName`                                  |

---

## Phase 1: Install `@cloudflare/ai-chat` (if needed for `AIChatAgent`)

The `agents` package lists `@cloudflare/ai-chat: ^0.3.2` as optional peer. If we want `AIChatAgent` class support for future agent migrations, install it:

```bash
pnpm add @cloudflare/ai-chat@^0.3.2
```
````

**Skip this if we only need `routeAgentRequest` + `getAgentByName` + `useAgent`** — those are all in the core `agents` package already installed.

---

## Phase 2: Add `routeAgentRequest` to Hono Router

**File: `src/backend/src/index.ts`**

Insert `routeAgentRequest` as a middleware BEFORE the `notFound` handler. This catches all `/agents/:agentName/:room` traffic (HTTP + WebSocket upgrades) and routes directly to the matching DO binding.

**Add import** (line 1 area):

```ts
import { routeAgentRequest } from "agents";
```

**Add route** before the `app.notFound(...)` block (before line 100):

```ts
// ---------------------------------------------------------------------------
// Agent SDK Routing — delegates /agents/:name/:room to the correct DO
// ---------------------------------------------------------------------------
app.all("/agents/*", async (c) => {
  const response = await routeAgentRequest(c.req.raw, c.env);
  if (response) return response;
  return c.json({ error: "Agent not found" }, 404);
});
```

This replaces the current pattern where frontend WebSocket connections to `/agents/cloudflare-docs-agent/{sessionId}` fall through to `notFound` and fail. Now they route directly to the DO via the SDK.

---

## Phase 3: Sentinel Broadcaster Standardization (3 files)

These files use raw DO access for `JULES_WEBHOOK_BROADCASTER`. Since broadcasters do NOT extend `Agent`, we use `BroadcastClient`.

### 3a. `src/backend/src/routes/api/projects/sentinel/types.ts`

**Add import:**

```ts
import { BroadcastClient } from "@utils/do-broadcast";
```

**Replace** `broadcastSentinelEvent()` function (lines 192-206):

```ts
export async function broadcastSentinelEvent(
  env: Env,
  payload: Record<string, unknown>,
): Promise<void> {
  await BroadcastClient.broadcast(
    env.JULES_WEBHOOK_BROADCASTER,
    "jules-broadcaster",
    {
      source: "sentinel",
      ...payload,
    },
  );
}
```

### 3b. `src/backend/src/routes/api/projects/sentinel/ws.ts`

**Add import:**

```ts
import { BroadcastClient } from "@utils/do-broadcast";
```

**Replace** lines 47-56 (raw DO WebSocket upgrade):

```ts
return BroadcastClient.upgradeWebSocket(
  c.env.JULES_WEBHOOK_BROADCASTER,
  "jules-broadcaster",
  req,
);
```

### 3c. `src/backend/src/routes/api/projects/sentinel/clarify.ts`

**Add imports:**

```ts
import { BroadcastClient } from "@utils/do-broadcast";
import { getAgentByName } from "agents";
```

**Replace** broadcaster block (lines 30-46) with:

```ts
await BroadcastClient.broadcast(
  env.JULES_WEBHOOK_BROADCASTER,
  "jules-broadcaster",
  {
    type: "clarification_request",
    taskId,
    sessionId: taskId,
    projectId: body.projectId,
    question: body.question,
    timestamp: new Date().toISOString(),
  },
);
```

**Replace** JULES_OVERSEER block (lines 50-65) with:

```ts
const overseerStub = getAgentByName(env.JULES_OVERSEER, "jules-overseer");
await overseerStub.fetch(
  new Request("http://agent/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "clarification_request",
      sessionId: taskId,
      taskId,
      question: body.question,
      projectId: body.projectId,
      agentId: body.agentId,
      timestamp: new Date().toISOString(),
    }),
  }),
);
```

---

## Phase 4: Agent SDK Migration — `getAgentByName` (5 files)

Replace all raw `idFromName` + `.get()` + `.fetch()` with `getAgentByName` from the `agents` package.

### 4a. `src/backend/src/automations/pr/SentinelPostMerge.ts` (CRITICAL — name bug fix)

**Add import:**

```ts
import { getAgentByName } from "agents";
```

**Replace** lines 74-90:

```ts
const agentStub = getAgentByName(this.env.LEARNING_AGENT, "learning-agent");
await agentStub.fetch(
  new Request("http://agent/ingest-pr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prNumber: pr.number,
      repoOwner: repository.owner.login,
      repoName: repository.name,
      prUrl: pr.html_url,
      prDescription: pr.body?.substring(0, 2000),
      merged: true,
    }),
  }),
);
```

**Fixes:** Instance name `"default"` → `'learning-agent'` + raw DO → SDK

### 4b. `src/backend/src/services/sentinel/ingestor.ts`

**Add import:**

```ts
import { getAgentByName } from "agents";
```

**Replace** lines 49-55:

```ts
const agentStub = getAgentByName(
  (c.env as any).LEARNING_AGENT,
  "learning-agent",
);
const analyzeRes = await agentStub.fetch(
  new Request("http://agent/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversations, repoless: body.repoless ?? false }),
  }),
);
```

### 4c. `src/backend/src/workflows/learning/LearningWorkflow.ts`

**Add import:**

```ts
import { getAgentByName } from "agents";
```

**Replace** lines 53-59:

```ts
const agentStub = getAgentByName(
  (this.env as any).LEARNING_AGENT,
  "learning-agent",
);
const res = await agentStub.fetch(
  new Request("http://agent/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }),
);
```

### 4d. `src/backend/src/routes/api/governance/index.ts`

**Add import:**

```ts
import { getAgentByName } from "agents";
```

**Replace** lines 31-41:

```ts
const agentStub = getAgentByName(
  (c.env as any).LEARNING_AGENT,
  "learning-agent",
);
const res = await agentStub.fetch(
  new Request("http://agent/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversations: body.conversations,
      repoless: body.repoless ?? true,
    }),
  }),
);
```

### 4e. `src/backend/src/routes/api/sentinel/tasks.ts`

**Add import:**

```ts
import { getAgentByName } from "agents";
```

**Replace** lines 200-207:

```ts
const judgeStub = getAgentByName(c.env.JUDGE_AGENT, `task-${id}`);
await judgeStub.fetch(
  new Request("http://agent/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: id, prUrl: body.prUrl }),
  }),
);
```

---

## Phase 5: Frontend `useAgent` Hook Migration

The `agents` package provides `useAgent` from `agents/react` (already in frontend deps at `^0.7.0`). This replaces the manual WebSocket management in `useHoniChatRuntime.ts`.

**File: `src/frontend/src/views/control/global/useHoniChatRuntime.ts`**

The current implementation manually opens WebSocket connections to `/agents/{agentId}/{sessionId}`. With `routeAgentRequest` now handling the backend routing, we can migrate to `useAgent`:

```ts
import { useAgent } from "agents/react";
```

The `useAgent` hook connects to `/agents/{agent}/{name}` automatically (matching `routeAgentRequest`'s URL pattern), handles reconnection, and provides typed RPC via `call()` and `stub`.

**Migration approach:**

- For agents with simple chat (Pattern A — `useHoniChatRuntime`): Migrate to `useAgent` with `onMessage` handler
- For complex agents (Pattern B — `useCFDocsRuntime`, Pattern C — `useDeepResearchRuntime`): Keep custom WebSocket management but ensure URLs point to `/agents/{name}/{room}` which `routeAgentRequest` now handles
- The `assistant-ui` `useLocalRuntime` / `useExternalStoreRuntime` can continue to be the presentation layer, with `useAgent` providing the transport

**Note:** Full `useAgentChat` from `@cloudflare/ai-chat/react` requires installing the optional peer dep. For now, the `useAgent` hook from `agents/react` + existing `assistant-ui` runtime adapters provides the same capability.

---

## Verification

### Type check

```bash
cd src/backend && npx tsc --noEmit
```

### Grep audit — zero raw DO violations outside utilities

```bash
grep -rn 'idFromName' src/backend/src/routes/ src/backend/src/services/sentinel/ src/backend/src/automations/ src/backend/src/workflows/ --include='*.ts'
```

Expected: 0 matches.

### `routeAgentRequest` integration test

```bash
# WebSocket upgrade should succeed (previously failed with 1102)
wscat -c "ws://localhost:8787/agents/cloudflare-docs-agent/test-session"
```

### Functional smoke tests

| Change                                      | Test                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Phase 2 (routeAgentRequest)                 | Frontend CF Docs chat connects via WS without Error 1102         |
| Phase 3a (types.ts)                         | Sentinel mutations → WS subscribers receive broadcast            |
| Phase 3b (ws.ts)                            | `GET /api/projects/sentinel/ws` → WS upgrade succeeds            |
| Phase 3c (clarify.ts)                       | `POST .../clarify` → broadcast + overseer notified               |
| Phase 4a (SentinelPostMerge)                | Merge PR → LearningAgent at `'learning-agent'` (not `'default'`) |
| Phase 4b-d (ingestor, workflow, governance) | Learning endpoints return valid responses                        |
| Phase 4e (tasks.ts)                         | Task submission → JUDGE_AGENT evaluate dispatched                |

---

## Files Modified Summary

| #   | File                                                      | Change                                  |
| --- | --------------------------------------------------------- | --------------------------------------- |
| 1   | `src/backend/src/index.ts`                                | Add `routeAgentRequest` catch-all route |
| 2   | `src/backend/src/routes/api/projects/sentinel/types.ts`   | `BroadcastClient.broadcast()`           |
| 3   | `src/backend/src/routes/api/projects/sentinel/ws.ts`      | `BroadcastClient.upgradeWebSocket()`    |
| 4   | `src/backend/src/routes/api/projects/sentinel/clarify.ts` | `BroadcastClient` + `getAgentByName`    |
| 5   | `src/backend/src/automations/pr/SentinelPostMerge.ts`     | `getAgentByName` + name fix             |
| 6   | `src/backend/src/services/sentinel/ingestor.ts`           | `getAgentByName`                        |
| 7   | `src/backend/src/workflows/learning/LearningWorkflow.ts`  | `getAgentByName`                        |
| 8   | `src/backend/src/routes/api/governance/index.ts`          | `getAgentByName`                        |
| 9   | `src/backend/src/routes/api/sentinel/tasks.ts`            | `getAgentByName`                        |

## Files NOT Modified

- `src/backend/src/utils/do-broadcast.ts` — correct, retained for broadcasters
- `src/backend/src/utils/honi-client.ts` — deprecated but not deleted (gradual migration of remaining 20+ call sites is separate work)
- Agent class files — no changes needed; `LearningAgent` already extends `Agent` from SDK, Honi agents have compatible `fetch()` handlers

## Out of Scope (Future Work)

- Full migration of all 37 Honi-based agents to extend `Agent`/`AIChatAgent` from `agents` package
- Replacing remaining ~20 `HoniClient` call sites across non-violating files
- Installing `@cloudflare/ai-chat` and migrating to `useAgentChat` (vs current `useAgent` + `assistant-ui`)
- Deleting `honi-client.ts` once all call sites are migrated

```

```
