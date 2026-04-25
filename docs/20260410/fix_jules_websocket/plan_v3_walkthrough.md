# Plan v3 Walkthrough: JulesWebhookBroadcaster → Agents SDK Migration

> **Completed:** 2026-04-13  
> **Plan:** [plan_v3.md](file:///Volumes/Projects/workers/core-github-api/docs/20260410/fix_jules_websocket/plan_v3.md)  
> **Build Status:** ✅ `pnpm run dry-run:tail` passed (13736.76 KiB / gzip: 2488.51 KiB, zero errors)

---

## Problem

Two bugs caused `401 Unauthorized` on every WebSocket connection to `JulesWebhookBroadcaster` and silently broke all broadcast fan-out:

1. **Query-param drop** — `BroadcastClient.upgradeWebSocket()` created `new Request("http://internal/ws", { headers })`, copying only headers and silently dropping `?apiKey=` and `?projectId=` query params. The DO never received auth credentials → 401.

2. **Broadcast path mismatch** — `BroadcastClient.broadcast()` posted to `http://do/broadcast` (pathname `/broadcast`) but the DO routed on `pathname === "/internal/broadcast"` → silent 404 swallowed by catch. **All real-time event fan-out was broken.**

3. **Frontend no-auth** — `jules-live-context.tsx` connected via raw `new WebSocket(url)` without passing `?apiKey=`. WebSocket spec forbids custom headers, and the `colby_api_key` cookie was never forwarded.

---

## Solution

Migrated `JulesWebhookBroadcaster` from bare `DurableObject<Env>` to the Cloudflare Agents SDK (`Agent<Env>` from `agents@0.10.0`), which provides built-in WebSocket lifecycle management, connection tagging, and hibernation-aware fan-out. Auth was moved to defense-in-depth: validated both at the Hono edge layer and inside `onConnect`.

---

## Changes Made

### 1. Core Agent — `JulesWebhookBroadcaster.ts` *(prior session)*

[JulesWebhookBroadcaster.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/do/JulesWebhookBroadcaster.ts)

- Extended `Agent<Env>` instead of `DurableObject<Env>`
- Removed all legacy methods: `fetch()`, `handleWebSocketUpgrade()`, manual auth, `webSocketClose()`, `webSocketError()`
- Added SDK lifecycle hooks:
  - `shouldSendProtocolMessages()` → `false` (suppresses `cf_agent_identity`/`cf_agent_state` frames)
  - `getConnectionTags()` → tags with `[projectId, "system:all"]`
  - `onConnect()` → defense-in-depth auth against `AGENTIC_WORKER_API_KEY` + `WORKER_API_KEY`
  - `onMessage()` → ping/pong handler
  - `onRequest()` → health + `/internal/broadcast` routing
- `handleBroadcast()` uses `this.getConnections(tag)` (SDK, hibernation-aware) with `Set<string>` deduplication

### 2. Jules Webhook Route — `jules.ts` *(prior session)*

[jules.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/routes/api/webhooks/jules.ts)

- Replaced `BroadcastClient` import with `getSecret` + `getAgentByName`
- `/ws` route: validates credentials at edge before delegating to Agent via `agent.fetch(c.req.raw)`
- `broadcast()` helper: uses `agent.fetch(new Request("http://internal/internal/broadcast", ...))` with correct path

### 3. Sentinel Consumers — `broadcast.ts`, `ws.ts`, `clarify.ts` *(current session)*

| File | Change |
|------|--------|
| [broadcast.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/routes/api/projects/sentinel/broadcast.ts) | `BroadcastClient.broadcast` → `getAgentByName` + `agent.fetch("/internal/broadcast")` |
| [ws.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/routes/api/projects/sentinel/ws.ts) | `BroadcastClient.upgradeWebSocket` → `getAgentByName` + `agent.fetch(req)` |
| [clarify.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/routes/api/projects/sentinel/clarify.ts) | `BroadcastClient.broadcast` → `getAgentByName` + `agent.fetch("/internal/broadcast")` |

### 4. Broadcast Path Fix — `do-broadcast.ts` *(prior session)*

[do-broadcast.ts](file:///Volumes/Projects/workers/core-github-api/src/backend/src/utils/do-broadcast.ts)

- Fixed `http://do/broadcast` → `http://internal/internal/broadcast` (line 69)
- This resolved the silent 404 for remaining `BroadcastClient` callers: `PlanningMonitor`, `ReverseEngineeringMonitor`, `RoomDO`

### 5. Frontend Auth — `jules-live-context.tsx` *(current session)*

[jules-live-context.tsx](file:///Volumes/Projects/workers/core-github-api/src/frontend/src/context/jules-live-context.tsx)

- Added `import Cookies from 'js-cookie'` (already a project dependency)
- WebSocket URL now includes `?apiKey=${Cookies.get('colby_api_key')}` — same cookie used by `api-client.ts`

### 6. Cleanup — Skipped

Original plan incorrectly identified `BroadcastClient` imports in `reverse-engineering.ts` and `planning.ts` as unused. Both files actively use `BroadcastClient` for their own independent DOs (`REVERSE_ENGINEERING_MONITOR`, `PLANNING_MONITOR`). No changes made.

### 7. Codified Rule — `agents-sdk.md` *(prior session)*

[agents-sdk.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/agents-sdk.md)

Codifies the Agents SDK patterns as a mandatory `.agent/rules/` file: `Agent<Env>` extension, defense-in-depth auth, protocol suppression, connection tagging, filtered broadcasting, and `getAgentByName` singleton routing.

---

## What Did NOT Change

- `wrangler.jsonc` — binding + migration unchanged
- `worker-configuration.d.ts` — auto-generated
- `src/backend/src/index.ts` — `routeAgentRequest` only handles `/agents/*`
- `src/backend/src/exports.ts` — re-export path unchanged
- `JulesLiveMessage` type — unchanged
- `POST /event` and `POST /status` route logic — untouched
- `PlanningMonitor`, `ReverseEngineeringMonitor`, `RoomDO` — independent DOs (benefit from path fix only)
- Health checks — only test binding existence

---

## Verification

| Check | Status |
|-------|--------|
| `pnpm run dry-run:tail` build | ✅ Passed — zero errors |
| All `BroadcastClient` refs removed from Jules/Sentinel paths | ✅ Verified |
| Frontend passes `?apiKey=` on WS URL | ✅ Implemented |
| Defense-in-depth auth (edge + onConnect) | ✅ Implemented |
| Protocol frame suppression | ✅ `shouldSendProtocolMessages → false` |
| Connection tagging for filtered fan-out | ✅ `getConnectionTags` with projectId + system:all |
| Broadcast path fix for remaining callers | ✅ `do-broadcast.ts` L69 corrected |

> [!TIP]
> **Remaining manual verification:** Deploy to staging and confirm via browser DevTools → Network → WS tab that (1) no `cf_agent_identity` frames appear, (2) events arrive as raw `JulesLiveMessage` JSON, and (3) the connection upgrades without 401 errors.
