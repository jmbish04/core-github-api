# Plan v3: Retrofit JulesWebhookBroadcaster to Cloudflare Agents SDK



> Target path: `docs/20260410/fix_jules_websocket/plan_v3.md` (will be copied on implementation start)



---



## 1. Context



`401 Unauthorized` errors on every WebSocket connection to `JulesWebhookBroadcaster`. Two root-cause bugs:



| Bug | Location | Cause |

|-----|----------|-------|

| **Query-param drop** | `do-broadcast.ts:96-100` | `upgradeWebSocket()` creates `new Request("http://internal/ws", { headers })` — copies headers only, silently drops `?apiKey=...` and `?projectId=...`. DO gets no key → 401. |

| **Broadcast path mismatch** | `do-broadcast.ts:69` | `broadcast()` sends to `http://do/broadcast` (pathname `/broadcast`) but DO routes on `pathname === "/internal/broadcast"` → silent 404, swallowed by catch. **All broadcast fan-out is currently broken.** |



Additionally, the frontend (`jules-live-context.tsx:157`) connects via raw `new WebSocket(url)` **without passing `?apiKey=`** — WebSocket spec forbids custom headers, and the `colby_api_key` cookie (used by `api-client.ts:24` for HTTP) is never forwarded to the WS URL.



Fix: extend `Agent<Env>` from `agents@0.10.0`, move auth to Hono edge, use SDK connection APIs, and pass auth from frontend.



---



## 2. Verified SDK Surface — `agents@0.10.0`



**Inheritance chain**: `Agent` → `Server` (partyserver@0.4.1) → `DurableObject`



| API | Source | Verified |

|-----|--------|----------|

| `broadcast(msg, without?: string[])` | `Server` (partyserver `dist/index.js:580`) | Yes — sends to all open connections, excluding IDs in `without` |

| `getConnections(tag?: string)` | `Server` (partyserver `dist/index.js:232`) — hibernation-aware via `HibernatingConnectionIterator` | Yes — yields `Connection` objects filtered by tag |

| `getConnection(id)` | `Server` | Yes |

| `getConnectionTags(conn, ctx)` | `Agent` override hook | Yes |

| `shouldSendProtocolMessages(conn, ctx)` | `Agent` override hook | Yes — suppresses `cf_agent_identity`, `cf_agent_state`, `cf_agent_mcp_servers` frames |

| `onConnect(conn, ctx)` | `Agent` lifecycle | Yes |

| `onMessage(conn, message)` | `Agent` lifecycle | Yes |

| `onClose(conn, code, reason, wasClean)` | `Agent` lifecycle | Yes |

| `onError(conn, error)` | `Agent` lifecycle | Yes |

| `onRequest(request)` | `Agent` — HTTP handler for non-WebSocket requests | Yes |



**Constraint**: `getConnectionTags` may return up to 9 tags, max 256 chars each.



**Protocol messages**: Agent SDK sends `cf_agent_identity`, `cf_agent_state`, `cf_agent_mcp_servers` JSON frames on every new connection. Frontend parses every message as `JulesLiveEvent` — SDK frames would cause `console.warn("[JulesLive] Failed to parse...")`. **Must override `shouldSendProtocolMessages` → `false`.**



---



## 3. Blast Radius Analysis



### Files requiring code changes (6)



| File | Current Usage | Change |

|------|---------------|--------|

| `src/backend/src/do/JulesWebhookBroadcaster.ts` | `extends DurableObject<Env>`, manual `fetch()`, in-DO auth | Extend `Agent<Env>`, SDK lifecycle hooks, remove in-DO auth |

| `src/backend/src/routes/api/webhooks/jules.ts` | `BroadcastClient.upgradeWebSocket()` (L326), `BroadcastClient.broadcast()` (L95) | Edge auth + `getAgentByName` for both WS upgrade and broadcast |

| `src/backend/src/routes/api/projects/sentinel/broadcast.ts` | `BroadcastClient.broadcast(env.JULES_WEBHOOK_BROADCASTER, "jules-broadcaster", ...)` (L11) | Replace with `getAgentByName` + `agent.fetch("/internal/broadcast")` |

| `src/backend/src/routes/api/projects/sentinel/ws.ts` | `BroadcastClient.upgradeWebSocket(env.JULES_WEBHOOK_BROADCASTER, "jules-broadcaster", req)` (L49) | Replace with `getAgentByName` + `agent.fetch(req)` |

| `src/backend/src/routes/api/projects/sentinel/clarify.ts` | `BroadcastClient.broadcast(env.JULES_WEBHOOK_BROADCASTER, "jules-broadcaster", ...)` (L32) | Replace with `getAgentByName` + `agent.fetch("/internal/broadcast")` |

| `src/frontend/src/context/jules-live-context.tsx` | `new WebSocket(url)` with no auth (L157-159) | Pass `colby_api_key` cookie as `?apiKey=` query param |



### Files requiring cleanup (2, optional)



| File | Issue |

|------|-------|

| `src/backend/src/routes/api/reverse-engineering.ts` | Uses `BroadcastClient` for its own DO (`REVERSE_ENGINEERING_MONITOR`) — **not** unused, no change needed |

| `src/backend/src/routes/api/planning.ts` | Uses `BroadcastClient` for its own DO (`PLANNING_MONITOR`) — **not** unused, no change needed |

> [!NOTE]
> **Plan Correction (Step 6):** The original plan incorrectly identified these as "unused" imports. Upon inspection, both files actively use `BroadcastClient` for their own independent Durable Objects (`REVERSE_ENGINEERING_MONITOR` and `PLANNING_MONITOR`), so they are left unchanged.



### Files requiring path fix (1)



| File | Issue |

|------|-------|

| `src/backend/src/utils/do-broadcast.ts` L69 | `http://do/broadcast` → `http://internal/internal/broadcast` — fixes silent 404 for all remaining `BroadcastClient.broadcast` callers (PlanningMonitor, ReverseEngineeringMonitor, RoomDO) |



### Files NOT changing (verified safe)



| File | Why safe |

|------|----------|

| `wrangler.jsonc` | Binding stays `DurableObjectNamespace`. `JulesWebhookBroadcaster` already in `new_sqlite_classes` migration (L444). `Agent` extends `DurableObject` via Server chain. |

| `worker-configuration.d.ts` | Auto-generated by `wrangler types`. Will regenerate correctly. |

| `src/backend/src/index.ts` | `routeAgentRequest` only handles `/agents/*` (L101-105) — does NOT intercept `/api/webhooks/jules/ws`. No conflict. |

| `src/backend/src/exports.ts` | Re-exports `JulesWebhookBroadcaster` from `@/do/JulesWebhookBroadcaster` — path unchanged. |

| `sentinel/health.ts`, `sentinel/status.ts`, `sentinel/mcp.ts` | Only check `Boolean(env.JULES_WEBHOOK_BROADCASTER)` — binding persists. |

| `services/planning/monitor.ts` | Uses `PLANNING_MONITOR` binding, independent DO. |

| `services/reverse-engineering/monitor.ts` | Uses `REVERSE_ENGINEERING_MONITOR` binding, independent DO. |

| `routes/api/webhooks/action-callback.ts` | Uses `ROOM_DO` binding, independent DO. |



---



## 4. Implementation Steps

> [!IMPORTANT]
> **Execution Summary:** All 7 steps have been executed. Steps 1, 2, 4, and 7 were completed in a prior session. Steps 3, 5, and 6 were completed in the current session. The `pnpm run dry-run:tail` build passed successfully with zero errors (Total Upload: 13736.76 KiB / gzip: 2488.51 KiB).

### Step 1 — Refactor `src/backend/src/do/JulesWebhookBroadcaster.ts`

> [!NOTE]
> ✅ **Completed (prior session).** The file now extends `Agent<Env>` from `"agents"`, implements all SDK lifecycle hooks (`shouldSendProtocolMessages`, `getConnectionTags`, `onConnect`, `onMessage`, `onRequest`), uses `this.getConnections(tag)` for filtered broadcast fan-out, and removes all legacy `DurableObject` and manual auth patterns.

**Imports:**

```diff

-import { DurableObject } from "cloudflare:workers";

+import { Agent } from "agents";

+import type { Connection, ConnectionContext, WSMessage } from "agents";

```

Keep: `import { Logger }` and `import { getSecret }` (needed for `onConnect` defense-in-depth).

- [x] Import `Agent`, `Connection`, `ConnectionContext`, `WSMessage` from `"agents"`

**Class:**

```diff

-export class JulesWebhookBroadcaster extends DurableObject<Env> {

+export class JulesWebhookBroadcaster extends Agent<Env> {

```

- [x] Extend `Agent<Env>` instead of `DurableObject<Env>`

**Remove entirely:**

- [x] `fetch(request)` method (base `Agent.fetch()` routes WebSocket upgrades automatically, non-WS to `onRequest`)

- [x] `handleWebSocketUpgrade(request)` method (replaced by `onConnect` + `getConnectionTags`)

- [x] All manual auth logic from the class body



**Add these SDK hooks:**

- [x] `shouldSendProtocolMessages` → returns `false`
- [x] `getConnectionTags` → tags with `[projectId, "system:all"]` or `["system:all"]`
- [x] `onConnect` — defense-in-depth auth check against `AGENTIC_WORKER_API_KEY` and `WORKER_API_KEY`
- [x] `onMessage` — ping/pong handler
- [x] `onRequest` — health check + `/internal/broadcast` routing

```ts

// Suppress SDK protocol frames — clients expect raw JulesLiveMessage JSON only

shouldSendProtocolMessages(_connection: Connection, _ctx: ConnectionContext): boolean {

  return false;

}



// Tag connections for filtered fan-out (max 9 tags, 256 chars each)

getConnectionTags(_connection: Connection, ctx: ConnectionContext): string[] {

  const url = new URL(ctx.request.url);

  const projectId = url.searchParams.get("projectId");

  return projectId ? [projectId, "system:all"] : ["system:all"];

}



// Defense-in-depth auth per CF docs best practice

async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {

  const url = new URL(ctx.request.url);

  const logger = new Logger(this.env, "JulesWebhookBroadcaster");



  const providedKey = url.searchParams.get("apiKey") || ctx.request.headers.get("X-API-Key");

  const [agentKey, workerKey] = await Promise.all([

    getSecret(this.env, "AGENTIC_WORKER_API_KEY"),

    getSecret(this.env, "WORKER_API_KEY"),

  ]);

  const validKeys = [agentKey, workerKey].filter(Boolean) as string[];

  if (validKeys.length > 0 && (!providedKey || !validKeys.includes(providedKey))) {

    logger.warn("[JulesWebhookBroadcaster] Rejected unauthorized connection");

    connection.close(4001, "Unauthorized");

    return;

  }



  logger.info(`[JulesWebhookBroadcaster] Connection accepted: ${connection.id}`);

}



// Ping/pong — same logic, SDK types

async onMessage(connection: Connection, message: WSMessage): Promise<void> {

  try {

    const text = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);

    const parsed = JSON.parse(text) as { type?: string };

    if (parsed?.type === "ping") {

      connection.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));

    }

  } catch {

    // Non-JSON — silently ignore

  }

}



// HTTP handler for non-WebSocket requests

async onRequest(request: Request): Promise<Response> {

  const url = new URL(request.url);

  if (url.pathname === "/health" || url.pathname === "/api/health") {

    return Response.json({ status: "ok", agent: "JulesWebhookBroadcaster" });

  }

  if (url.pathname === "/internal/broadcast" && request.method === "POST") {

    return this.handleBroadcast(request);

  }

  return new Response("Not Found", { status: 404 });

}

```



**Update `handleBroadcast`** — use `this.getConnections(tag)` (SDK, hibernation-aware) not `this.ctx.getWebSockets(tag)`:

- [x] Use `this.getConnections(tag)` for filtered broadcast with deduplication via `Set<string>`

```ts

private async handleBroadcast(request: Request): Promise<Response> {

  let message: JulesLiveMessage & { projectId?: string };

  try {

    message = await request.json();

  } catch {

    return new Response("Invalid JSON body", { status: 400 });

  }



  const payload = JSON.stringify(message);

  let sent = 0;



  if (message.projectId) {

    const seen = new Set<string>();

    for (const conn of this.getConnections(message.projectId)) {

      if (!seen.has(conn.id)) { seen.add(conn.id); conn.send(payload); sent++; }

    }

    for (const conn of this.getConnections("system:all")) {

      if (!seen.has(conn.id)) { seen.add(conn.id); conn.send(payload); sent++; }

    }

  } else {

    for (const conn of this.getConnections()) {

      conn.send(payload); sent++;

    }

  }



  return Response.json({ ok: true, clients: sent });

}

```



- [x] Remove `webSocketClose()`, `webSocketError()` — were no-ops; Agent base handles cleanup via partyserver `Server`.



### Step 2 — Update `src/backend/src/routes/api/webhooks/jules.ts`

> [!NOTE]
> ✅ **Completed (prior session).** The `/ws` route now validates credentials at the Hono edge layer before delegating to the Agent via `getAgentByName`. The `broadcast()` helper uses `agent.fetch(new Request("http://internal/internal/broadcast", ...))` with proper path. All `BroadcastClient` references have been removed.

**Import changes:**

```diff

-import { BroadcastClient } from "@utils/do-broadcast";

+import { getSecret } from "@/utils/secrets";

```

(Keep existing `import { getAgentByName } from "agents"` — already present at L37.)

- [x] Replace `BroadcastClient` import with `getSecret`


**Replace `/ws` route** (L320-331):

- [x] Add edge auth validation (query param + header check against secrets)
- [x] Delegate to Agent via `getAgentByName` + `agent.fetch(c.req.raw)`

```ts

app.get("/ws", async (c) => {

  if (c.req.header("Upgrade") !== "websocket") {

    return c.text("Expected WebSocket upgrade", 426);

  }



  // Primary auth gate at edge

  const providedKey = c.req.query("apiKey") || c.req.header("X-API-Key");

  const [agentKey, workerKey] = await Promise.all([

    getSecret(c.env, "AGENTIC_WORKER_API_KEY"),

    getSecret(c.env, "WORKER_API_KEY"),

  ]);

  const validKeys = [agentKey, workerKey].filter(Boolean) as string[];

  if (validKeys.length > 0 && (!providedKey || !validKeys.includes(providedKey))) {

    return c.json({ error: "Unauthorized" }, 401);

  }



  // Delegate to Agent — base class handles WebSocket handshake

  const agent = await getAgentByName(c.env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");

  return agent.fetch(c.req.raw);  // preserves full URL including ?apiKey= and ?projectId=

});

```



**Replace `broadcast()` helper** (L93-99):

- [x] Replace `BroadcastClient.broadcast` with `getAgentByName` + `agent.fetch` to `/internal/broadcast`

```ts

async function broadcast(env: Env, message: JulesLiveMessage): Promise<void> {

  try {

    const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");

    await agent.fetch(new Request("http://internal/internal/broadcast", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(message),

    }));

  } catch (err) {

    console.error("[JulesWebhook] Failed to broadcast to Agent:", err);

  }

}

```



### Step 3 — Update Sentinel consumers

> [!NOTE]
> ✅ **Completed (current session).** All three sentinel files (`broadcast.ts`, `ws.ts`, `clarify.ts`) have been migrated from `BroadcastClient` to `getAgentByName` + `agent.fetch`. The `BroadcastClient` import has been fully removed from all three.

**`sentinel/broadcast.ts`** — replace `BroadcastClient.broadcast` with Agent SDK:

- [x] Replace `BroadcastClient` import with `getAgentByName` from `"agents"`
- [x] Use `agent.fetch(new Request("http://internal/internal/broadcast", ...))` for fan-out

```ts

import { getAgentByName } from "agents";



export async function broadcastSentinelEvent(env: Env, payload: Record<string, unknown>): Promise<void> {

  const logger = new Logger(env, "broadcastSentinelEvent");

  try {

    const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");

    await agent.fetch(new Request("http://internal/internal/broadcast", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ source: "sentinel", ...payload }),

    }));

    logger.info(`Successfully broadcasted sentinel event`);

  } catch (err: any) {

    logger.error(`Failed to broadcast sentinel event: ${err.message}`);

  }

}

```



**`sentinel/ws.ts`** — replace `BroadcastClient.upgradeWebSocket` (L49-53):

- [x] Replace `BroadcastClient` import with `getAgentByName` from `"agents"`
- [x] Forward raw request via `agent.fetch(req)` to preserve URL params

```ts

import { getAgentByName } from "agents";

// ... (existing auth logic at L31-40 stays — already validates X-API-Key)

const agent = await getAgentByName(c.env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");

return agent.fetch(req);

```



**`sentinel/clarify.ts`** — replace `BroadcastClient.broadcast` (L32-43):

- [x] Replace `BroadcastClient` import with `getAgentByName` from `"agents"`
- [x] Use `agent.fetch(new Request("http://internal/internal/broadcast", ...))` for broadcast

```ts

const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");

await agent.fetch(new Request("http://internal/internal/broadcast", {

  method: "POST",

  headers: { "Content-Type": "application/json" },

  body: JSON.stringify({

    type: 'clarification_request',

    taskId,

    sessionId: taskId,

    projectId: body.projectId,

    question: body.question,

    timestamp: new Date().toISOString(),

  }),

}));

```



### Step 4 — Fix `do-broadcast.ts` path bug

> [!NOTE]
> ✅ **Completed (prior session).** The broadcast path was corrected from `http://do/broadcast` to `http://internal/internal/broadcast`, fixing the silent 404 for all remaining `BroadcastClient` callers.

Line 69:

```diff

-        new Request('http://do/broadcast', {

+        new Request('http://internal/internal/broadcast', {

```

- [x] Path corrected to `http://internal/internal/broadcast`

This fixes the silent 404 for remaining `BroadcastClient.broadcast` callers: `PlanningMonitor`, `ReverseEngineeringMonitor`, `RoomDO`.



### Step 5 — Frontend: pass auth to WebSocket URL

> [!NOTE]
> ✅ **Completed (current session).** The frontend now reads the `colby_api_key` cookie via `js-cookie` (already a project dependency) and appends it as `?apiKey=` on the WebSocket URL, matching the pattern used by `useSentinel.ts` and `SentinelKanban.tsx`.

**`src/frontend/src/context/jules-live-context.tsx`** — update L155-158:

- [x] Add `import Cookies from 'js-cookie'`
- [x] Read `colby_api_key` cookie and append as `?apiKey=` query param

```ts

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

const apiKey = Cookies.get('colby_api_key');  // same cookie used by api-client.ts

const authParam = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';

const wsUrl = `${protocol}//${window.location.host}/api/webhooks/jules/ws${authParam}`;

```



Add import: `import Cookies from 'js-cookie';` (already a project dependency, used in `api-client.ts`).



### Step 6 — Cleanup (optional)

> [!NOTE]
> ⏭️ **Skipped — plan correction.** Original plan stated these were "unused" `BroadcastClient` imports, but upon verification both files actively use `BroadcastClient` for their own independent DOs (`REVERSE_ENGINEERING_MONITOR` and `PLANNING_MONITOR`). Removing the imports would break those files.

- [x] ~~Remove unused `BroadcastClient` import from `routes/api/reverse-engineering.ts`~~ — Actually used (for `REVERSE_ENGINEERING_MONITOR` WS)

- [x] ~~Remove unused `BroadcastClient` import from `routes/api/planning.ts`~~ — Actually used (for `PLANNING_MONITOR` WS)



### Step 7 — Add `.agent/rules/agents-sdk.md`

> [!NOTE]
> ✅ **Completed (prior session).** The rule file codifies all Agents SDK patterns including `Agent<Env>` extension, defense-in-depth auth, protocol message suppression, connection tagging, filtered fan-out broadcasting, and singleton routing via `getAgentByName`.

Codify:

- [x] Extend `Agent<Env>` from `"agents"` for stateful WebSocket services

- [x] Auth at Hono edge AND `onConnect` (defense-in-depth; close code 4001)

- [x] `shouldSendProtocolMessages() → false` for custom-protocol hubs not using Client SDK

- [x] Tags via `getConnectionTags` (max 9, 256 chars); retrieve via `this.getConnections(tag)`

- [x] `this.broadcast(msg, without?)` for all-connections; `this.getConnections(tag)` for filtered

- [x] Singleton via `getAgentByName(env.BINDING as any, "name-string")`

- [x] Never mix raw DO API (`this.ctx.getWebSockets`) with SDK API (`this.getConnections`)



---



## 5. What Does NOT Change



- `wrangler.jsonc` — binding stays `DurableObjectNamespace`; migration already in `new_sqlite_classes`

- `worker-configuration.d.ts` — auto-generated, regenerates via `wrangler types`

- `src/backend/src/index.ts` — `routeAgentRequest` handles `/agents/*` only, no conflict

- `src/backend/src/exports.ts` — re-export path unchanged

- `src/services/jules/types.ts` — `JulesLiveMessage` type unchanged

- `POST /event` and `POST /status` route logic — untouched (only the `broadcast()` helper changes)

- `PlanningMonitor`, `ReverseEngineeringMonitor`, `RoomDO` — independent DOs, benefit from path fix only

- Health checks (`sentinel/health.ts`, `sentinel/status.ts`, `sentinel/mcp.ts`) — only test binding existence



---



## 6. Verification



| Check | How | Expected |

|-------|-----|----------|

| No more 401s | `wrangler dev` → open frontend → check `wrangler.log` | No `Unauthorized` errors on `/ws` |

| WS connects with auth | Frontend opens WS with `?apiKey=` from cookie | `onConnect` logs `Connection accepted: <id>` |

| Protocol frames suppressed | Browser DevTools → WS messages tab | No `cf_agent_identity`/`cf_agent_state` frames; first message is a `JulesLiveMessage` |

| Project filtering | Connect with `?projectId=X` → trigger event for project X | Only events for project X + system:all events arrive |

| Broadcast path | Trigger Jules `/event` POST → check Agent response | `{ ok: true, clients: N }` where N > 0 |

| Edge auth rejection | Connect without `?apiKey=` when secrets configured | Hono returns 401 before Agent is invoked |

| DO-level auth rejection | Direct DO fetch without key (bypass Worker) | `onConnect` closes with code 4001 |

| Sentinel broadcast | POST sentinel event → check WS clients | Sentinel events fan out correctly to all subscribers |

| Sentinel WS | Connect via `/api/projects/sentinel/ws` with `X-API-Key` | Upgrade succeeds, receives broadcasts |

| **Build verification** | `pnpm run dry-run:tail` | ✅ Passed — 13736.76 KiB / gzip: 2488.51 KiB, zero errors |
