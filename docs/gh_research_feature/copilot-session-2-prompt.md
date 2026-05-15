# Copilot Coding Agent — Session 2 prompt (post EPIC-0 PR #462 merge)

> **Paste this entire prompt into a new GitHub Copilot Coding Agent task** at https://github.com/jmbish04/core-github-api once PR #462 has merged into `feat/v8.1-migration`.

---

## Task: complete EPIC-0 (10 of 18 sub-tasks remaining)

The first Copilot session (PR #462, branch `claude/epic-0-agenticsession-service`) shipped the AgenticSession **backend foundation**: Drizzle schemas, zod types, JWT auth, D1 query layer, SessionClient, and `AgenticSessionDO` (using raw `DurableObject<Env>` — confirmed correct for a pub/sub broker). It merged into `feat/v8.1-migration`.

You're picking up where that session left off. Your job is the remaining 10 sub-tasks from `docs/gh_research_feature/TASKS.json` `epics[0].tasks`.

## Branch

- Base: `feat/v8.1-migration`
- New branch: `feat/gh-research/epic-0b-routes-frontend`
- PR target: `feat/v8.1-migration`
- PR title: `[EPIC-0 Phase 2] AgenticSession routes + frontend + legacy delegates + tests`

## Mandatory reading order

Read these in the repo before writing any code:

1. `AGENTS.md`
2. `docs/gh_research_feature/PROMPT.md` (your standing rules — every section applies)
3. `docs/gh_research_feature/PRD.md` (especially §4 AgenticSession + §10 data model)
4. `docs/gh_research_feature/TASKS.json` (find `epics[0]`; the 10 tasks below are S0-T8, T9, T11–T18 — the ones already done are T2–T7)
5. `docs/gh_research_feature/stitch/stitch_zip_contents/stitch_core_github_api_repo_dashboard/` — pre-generated Stitch mockups for the frontend pages. The HTML files in `sessions_monitor_active_2/`, `sessions_monitor_empty_state_2/`, `sessions_monitor_mobile_2/`, plus the design system in `monolith_sessions_profile_2/DESIGN.md`, are your visual + structural source of truth. Rebuild from them — do not regenerate.
6. The merged Phase 1 code under `src/backend/src/services/agentic-session/` and `src/backend/src/do/AgenticSessionDO.ts` so you understand the existing public surface (especially `SessionClient`, the `/publish`, `/grant`, `/events`, `/subscribers`, `/ws` internal endpoints, and the JWT auth helper).

## The 10 tasks (do them in this order)

### S0-T8: Hono routes under `/api/sessions/*`

Create the following files under `src/backend/src/routes/api/sessions/`:

- `ws.ts` — `GET /api/sessions/:sessionId/ws` — JWT-validate the `?token=` query param, then forward the Upgrade request to the DO's internal `/ws` endpoint. Reject 401/403 at the Hono layer before the DO is even woken if the token is missing/malformed.
- `events.ts` — `GET /api/sessions/:sessionId/events?limit=&afterSeq=` — list events from the DO. `POST /api/sessions/:sessionId/events` — publish (requires `publish` permission). Both forward through `SessionClient`.
- `subscribers.ts` — `GET /api/sessions/:sessionId/subscribers` — list active subscribers.
- `grants.ts` — `POST /api/sessions/:sessionId/grants` (issue grant), `DELETE /api/sessions/:sessionId/grants/:subject/:permission` (revoke).
- `index.ts` — re-export the sub-routers and mount them as a single zod-openapi router. Then in `src/backend/src/routes/api/index.ts`, mount `/sessions` to point at this router.

All routes use `OpenAPIHono` + `@hono/zod-openapi` schemas (reference: other route folders like `src/backend/src/routes/api/research/`). Routes must appear in `/openapi.json` automatically.

### S0-T9: public surface

Create `src/backend/src/services/agentic-session/index.ts` re-exporting:

- `getSession(env, sessionId)` (already exists internally — make sure the public export shape is `(env, sessionId) => SessionClient`)
- `createSession(env, init)` (UUID generation, owner grant seeded, returns SessionClient)
- `SessionClient` (the class from Phase 1)
- All `types.ts` event types and `Permission`

Create `src/backend/src/services/agentic-session/server.ts` for the Hono router export if it isn't already split out.

### S0-T11: `useAgenticSession` React hook

`src/frontend/src/hooks/useAgenticSession.ts`:

```ts
export function useAgenticSession(sessionId: string, opts: {
  apiKey: string;
  filter?: { types?: SessionEventType[] };
}): {
  events: SessionEvent[];
  status: 'connecting' | 'open' | 'closed' | 'error';
  participants: Participant[];
  publish: (event: Omit<SessionEvent, 'sessionId' | 'sequenceNum' | 'timestamp'>) => Promise<void>;
}
```

- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Filter prop limits which event types stream
- Use `aria-live="polite"` patterns where consumed
- Survives Strict Mode double-mount

### S0-T12: components

`src/frontend/src/views/session/SessionTranscript.tsx`, `SessionEventCard.tsx`, `ParticipantsRail.tsx`. Build from the Stitch HTML mockups in `docs/gh_research_feature/stitch/stitch_zip_contents/stitch_core_github_api_repo_dashboard/sessions_monitor_*/code.html`. Native shadcn imports from `@/components/ui/*` only. No 1px borders — `ring-1 ring-border/40` / `divide-y divide-border/40` / `bg-card`. Dark theme always.

### S0-T13: `SessionMonitor.tsx`

`src/frontend/src/views/session/SessionMonitor.tsx` — global active-sessions list. Reference the Stitch mockup `sessions_monitor_active_2/code.html`. Three accordion sections (Active / Complete / Failed), filter row, sortable, mobile responsive.

### S0-T14: Astro pages

- `src/frontend/src/pages/sessions/index.astro` — wraps `<SessionMonitor />`
- `src/frontend/src/pages/sessions/[id].astro` — standalone session viewer wrapping `<SessionTranscript sessionId={...} />` + `<ParticipantsRail />`

### S0-T15: `JulesWebhookBroadcaster` refactor (backward-compatible)

`src/backend/src/do/JulesWebhookBroadcaster.ts` — when a Jules webhook arrives, in addition to existing fan-out, also call `SessionClient.publish` against the corresponding AgenticSession keyed by the Jules session id, with event types `jules.status` and `jules.event`. **Public API must remain unchanged** (consumers keep working for one release cycle).

### S0-T16: `JulesLiveProvider` context wrapper

`src/frontend/src/context/jules-live-context.tsx` — change implementation to internally use `useAgenticSession(julesSessionId, { filter: { types: ['jules.status', 'jules.event'] } })`. Public API of the provider/hook stays unchanged.

### S0-T17: `@deprecated` JSDoc tags

Add `@deprecated` JSDoc to `src/backend/src/do/RoomDO.ts` and `src/backend/src/do/AgentSessionDO.ts` pointing readers to `AgenticSession`. No functional change.

### S0-T18: Vitest round-trip test

`tests/services/agentic-session/round-trip.spec.ts`:

- Spin up a Miniflare instance with the DO binding
- Call `SessionClient.publish({ type: 'agent.thought', ... })`
- Open a websocket via the `/ws` endpoint with a freshly-issued JWT
- Assert the event arrives over the websocket within 200ms
- Also assert grant rejection (no `read` grant → 403 on upgrade)

## Standing rules (DO NOT violate)

- `Env` is a global interface — never import, never redefine. Use it directly.
- `worker-configuration.d.ts` is auto-generated by `wrangler types`. Never edit.
- One file per table for schemas. Folder `index.ts` re-exports. No flat dumps.
- `<Navbar />` on every page. Dark theme always (`<html class="dark">`). Mobile-responsive with collapsible sidebar.
- Shadcn imports from `@/components/ui/*` only — no lookalikes.
- No `console.log` — use `logger` everywhere.
- `pnpm typecheck` must pass clean.
- All routes appear in `/openapi.json` dynamically.

## What NOT to do

- ❌ Don't touch `wrangler.jsonc` — orchestrator handles the `AGENTIC_SESSION_DO` binding + class_name migration
- ❌ Don't regenerate `worker-configuration.d.ts`
- ❌ Don't run database migrations — orchestrator runs `pnpm run db:generate` after schemas finalize
- ❌ Don't refactor the existing `AgenticSessionDO` away from raw `DurableObject<Env>` — that pattern is intentional for a pub/sub broker
- ❌ Don't open a PR until ALL 10 tasks are complete + tests passing + typecheck clean

## Acceptance criteria

When you sign off the PR, all of these must be true:

- [ ] All 6 sub-files in `src/backend/src/routes/api/sessions/` exist, mounted, openapi-visible
- [ ] `services/agentic-session/index.ts` exports the public surface
- [ ] `useAgenticSession` hook works in Strict Mode, reconnects on close
- [ ] `SessionTranscript`, `SessionEventCard`, `ParticipantsRail`, `SessionMonitor` rendered with the Stitch HTML as reference
- [ ] `/sessions` and `/sessions/[id]` Astro pages render the components
- [ ] `JulesWebhookBroadcaster` publishes `jules.*` events into AgenticSession; existing API unchanged
- [ ] `JulesLiveProvider` wraps `useAgenticSession`; existing API unchanged
- [ ] `RoomDO` + `AgentSessionDO` have `@deprecated` tags
- [ ] Vitest round-trip test passes
- [ ] `pnpm typecheck` clean
- [ ] No `console.log`
- [ ] All shadcn imports from `@/components/ui/*` barrel

When done, request `/gemini review` on the PR and ping the orchestrator.
