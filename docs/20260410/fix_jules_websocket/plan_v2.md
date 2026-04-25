# Plan: Retrofit JulesWebhookBroadcaster to Cloudflare Agents SDK

## Context

`401 Unauthorized` errors occur on WebSocket connections to `JulesWebhookBroadcaster` because `BroadcastClient.upgradeWebSocket` (`do-broadcast.ts:96-100`) creates a new `Request` with `http://internal/ws` but copies **only headers** — not URL query params. Client-supplied `?apiKey=...` is silently dropped, so the DO receives a request with no key and rejects it.

A second silent bug: `BroadcastClient.broadcast` (`do-broadcast.ts:69`) sends to `http://do/broadcast` (pathname `/broadcast`) but the DO routes on `url.pathname === "/internal/broadcast"` — path mismatch causes all broadcast POSTs to return 404, swallowed by the catch block.

Fix: extend `Agent<Env>`, move auth to the Hono route handler (edge), and use the SDK's native connection APIs.

---

## Critical Files

| File | Change |
|------|--------|
| `src/backend/src/do/JulesWebhookBroadcaster.ts` | Extend `Agent<Env>`, remove auth, use `getConnectionTags`, `onConnect`, `onMessage`, `getConnections`, `shouldSendProtocolMessages` |
| `src/backend/src/routes/api/webhooks/jules.ts` | Auth at edge in `/ws` route, use `getAgentByName` for WS upgrade + broadcast |
| `src/backend/src/utils/do-broadcast.ts` | Fix broadcast path bug: `/broadcast` → `/internal/broadcast` |
| `.agent/rules/agents-sdk.md` | New rule file codifying the Agents SDK auth + WebSocket pattern |

---

## CF Docs Research Findings

From [developers.cloudflare.com/agents/api-reference/websockets](https://developers.cloudflare.com/agents/api-reference/websockets/):
- Use `getConnectionTags(connection, ctx)`: up to **9 tags, max 256 chars each**
- Use `this.getConnections(tag)` (returns `Iterable<Connection>`) — NOT `this.ctx.getWebSockets(tag)`
- Use `conn.send(message)` on each `Connection` object
- Use `this.broadcast(message, without?)` to broadcast to all connections

From [developers.cloudflare.com/agents/api-reference/protocol-messages](https://developers.cloudflare.com/agents/api-reference/protocol-messages/):
- **CRITICAL**: Agent SDK automatically sends `cf_agent_identity`, `cf_agent_state`, `cf_agent_mcp_servers` JSON frames on every new WebSocket connection
- The frontend `jules-live-context.tsx` uses raw `JSON.parse` on every message and expects only `JulesLiveMessage` format — SDK protocol frames would cause parse errors
- Must override `shouldSendProtocolMessages(connection, ctx): boolean` returning `false` to suppress these

From [developers.cloudflare.com/agents/guides/cross-domain-authentication](https://developers.cloudflare.com/agents/guides/cross-domain-authentication/):
- Best practice: validate tokens in **both** edge (Hono) AND `onConnect` (defense-in-depth)
- Close unauthorized connections with `connection.close(4001, "Unauthorized")`
- Never validate only once

---

## Implementation Steps

### Step 1 — Refactor `JulesWebhookBroadcaster.ts`

**Import changes:**
```diff
-import { DurableObject } from "cloudflare:workers";
-import { getSecret } from '@/utils/secrets';
+import { Agent } from "agents";
+import type { Connection, ConnectionContext, WSMessage } from "agents";
+import { getSecret } from '@/utils/secrets';  // kept for onConnect defense-in-depth
```

**Class declaration:**
```diff
-export class JulesWebhookBroadcaster extends DurableObject<Env> {
+export class JulesWebhookBroadcaster extends Agent<Env> {
```

**Remove entirely:** `fetch()`, `handleWebSocketUpgrade()` (both handled by Agent base class)

**Add — suppress SDK protocol frames** (prevents parse errors in `jules-live-context.tsx`):
```ts
shouldSendProtocolMessages(_connection: Connection, _ctx: ConnectionContext): boolean {
  return false;  // This is a raw fan-out hub; clients expect JulesLiveMessage format only
}
```

**Add — connection tagging** (up to 9 tags, max 256 chars per CF docs):
```ts
getConnectionTags(connection: Connection, ctx: ConnectionContext): string[] {
  const url = new URL(ctx.request.url);
  const projectId = url.searchParams.get("projectId");
  return projectId ? [projectId, "system:all"] : ["system:all"];
}
```

**Add — defense-in-depth auth** (per CF docs best practice: "validate on every connection"):
```ts
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
```

**Replace `webSocketMessage`** with `onMessage` (ping/pong logic unchanged):
```ts
async onMessage(connection: Connection, message: WSMessage): Promise<void> {
  // ...existing ping/pong logic using connection.send() instead of ws.send()
}
```

**Remove:** `webSocketClose()`, `webSocketError()` — were no-ops; Agent base handles cleanup

**Update `onRequest` + `handleBroadcast`** — use `this.getConnections(tag)` (SDK API) instead of `this.ctx.getWebSockets(tag)` (raw DO API):
```ts
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
    // Fan out to project subscribers + system:all, deduped by connection.id
    const seen = new Set<string>();
    for (const conn of this.getConnections(message.projectId)) {
      if (!seen.has(conn.id)) { seen.add(conn.id); conn.send(payload); sent++; }
    }
    for (const conn of this.getConnections("system:all")) {
      if (!seen.has(conn.id)) { seen.add(conn.id); conn.send(payload); sent++; }
    }
  } else {
    // Broadcast to all via SDK method
    for (const conn of this.getConnections()) {
      conn.send(payload); sent++;
    }
  }

  return Response.json({ ok: true, clients: sent });
}
```

### Step 2 — Update `/ws` route in `jules.ts`

Add auth at the Worker edge layer (primary gate), then delegate via `getAgentByName`:

```ts
import { getSecret } from "@/utils/secrets";  // add this import

app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  // Primary auth gate at the edge (before Agent sees the request)
  const providedKey = c.req.query("apiKey") || c.req.header("X-API-Key");
  const [agentKey, workerKey] = await Promise.all([
    getSecret(c.env, "AGENTIC_WORKER_API_KEY"),
    getSecret(c.env, "WORKER_API_KEY"),
  ]);
  const validKeys = [agentKey, workerKey].filter(Boolean) as string[];
  if (validKeys.length > 0 && (!providedKey || !validKeys.includes(providedKey))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Delegate to Agent — base class handles WS handshake, then calls getConnectionTags + onConnect
  const agent = await getAgentByName(c.env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");
  return agent.fetch(c.req.raw);  // c.req.raw preserves full URL + query params
});
```

Update the `broadcast()` helper — replace `BroadcastClient` with direct `getAgentByName`:

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

Remove the `BroadcastClient` import from `jules.ts` — no longer used in this file.

### Step 3 — Fix path bug in `do-broadcast.ts`

Line 69: `http://do/broadcast` → `http://internal/internal/broadcast`

```diff
-        new Request('http://do/broadcast', {
+        new Request('http://internal/internal/broadcast', {
```

This fixes silent 404s for other callers still using `BroadcastClient.broadcast` (Sentinel broadcaster).

### Step 4 — Add `.agent/rules/agents-sdk.md`

Key rules to codify:
- Extend `Agent<Env>` (from `"agents"`) for all stateful WebSocket services
- Auth: validate at Hono edge AND in `onConnect` (defense-in-depth; close with code 4001 on failure)
- Override `shouldSendProtocolMessages` → `false` for custom-protocol hubs that don't use the Client SDK
- Tag filtering: `getConnectionTags` (max 9 tags, 256 chars each); retrieve via `this.getConnections(tag)`
- Fan-out: `this.broadcast(msg)` for all-connections; `this.getConnections(tag)` for filtered sends
- Singleton routing: `getAgentByName(env.BINDING as any, "name-string")`
- Never mix raw DO APIs (`this.ctx.getWebSockets`) with Agent SDK APIs (`this.getConnections`)

---

## What Does NOT Change

- `wrangler.jsonc` — binding stays `DurableObjectNamespace`; `Agent` extends `DurableObject`
- `worker-configuration.d.ts` — `JULES_WEBHOOK_BROADCASTER: DurableObjectNamespace` unchanged
- `src/services/jules/types.ts` — `JulesLiveMessage` type unchanged
- `POST /event` and `POST /status` route logic — untouched
- `jules-live-context.tsx` — unchanged; `shouldSendProtocolMessages: false` ensures it keeps working
- Sentinel broadcaster (separate DO, out of scope — but benefits from `do-broadcast.ts` path fix)

---

## Verification

1. **Wrangler dev logs**: No more `401 Unauthorized` on `/ws` requests
2. **WebSocket upgrade**: Frontend connects (no API key, dev mode) → `onConnect` logs `Connection accepted`
3. **Protocol messages suppressed**: No `cf_agent_identity`/`cf_agent_state` parse errors in browser console
4. **Project filtering**: Connect with `?projectId=X` → only events with matching `projectId` arrive
5. **Broadcast path**: POST a Jules event → broadcast POSTs to `/internal/broadcast` → DO returns `{ ok: true, clients: N }`
6. **Edge auth**: Request with wrong `apiKey` → Hono returns `401` before Agent is invoked
7. **DO-level auth**: Send WS upgrade directly to DO without key (bypassing Worker) → `onConnect` closes with code `4001`
