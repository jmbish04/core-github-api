# Phase 3 — Typecheck fixes needed in Phase 2 code

> **STATUS: RESOLVED in commit `30d2df9` on `feat/v8.1-migration`.**
> `pnpm run check` is clean; `pnpm run db:generate:core` reports
> "No schema changes, nothing to migrate". This document is retained
> as a historical record of what shifted between Phase 2 and Phase 3.

After merging Phase 2 (PR #466) and wiring the orchestrator pieces (binding + migration + `wrangler types` regen + schema-name collision fix), `pnpm run check` surfaced a set of latent type errors in the Phase 2 Copilot code. These didn't show up in Copilot's session because the binding wasn't on `Env` yet and the schema-collision rename forced Drizzle to retypify the tables.

All errors below were fixed directly in commit `30d2df9`. Listed in original order of estimated fix effort.

## Trivial (1-line each)

### 1. `tests/services/agentic-session/round-trip.spec.ts:10`
`UnstableDevWorker` was renamed to `Unstable_DevWorker` in newer Wrangler.
```ts
- import { unstable_dev, UnstableDevWorker } from 'wrangler';
+ import { unstable_dev, Unstable_DevWorker } from 'wrangler';
```

### 2. `src/backend/src/services/agentic-session/schemas/session_grants.ts:23`
Boolean column default must be a `boolean`, not a `number`.
```ts
- revoked: integer('revoked', { mode: 'boolean' }).notNull().default(0),
+ revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
```

### 3. `src/backend/src/services/agentic-session/types.ts:24, 66, 119`
Three callsites use a 1-arg form where 2-3 args are required. Likely `z.discriminatedUnion('type', [...])` missing the discriminator key OR a `z.object({...}).extend()` chain. Inspect each line; add the missing args.

## Drizzle date/boolean mode mismatches in `services/agentic-session/d1.ts`

Phase 2 schemas declared timestamps as `integer('foo', { mode: 'timestamp' })` (which Drizzle types as `Date` at the application layer) and the `revoked` column as `mode: 'boolean'` (typed as `boolean`). But the d1.ts query layer passes Unix-second `number` and `0`/`1` literals. Either change the schemas OR change the consumers — recommend changing the **consumers** (d1.ts) to use `new Date(...)` and `true`/`false` to keep schemas readable.

| Line | Fix |
|---|---|
| `d1.ts:135` `addSubscriber` insert | wrap `connectedAt` value in `new Date(...)` (or omit since schema has default) |
| `d1.ts:144` `updateHeartbeat` set | `lastHeartbeat: new Date()` |
| `d1.ts:155` `removeSubscriber` set | `disconnectedAt: new Date()` |
| `d1.ts:170` `updateSessionStatus` set | `completedAt: new Date()` |
| `d1.ts:209` `createGrant` insert | check the explicit `id` field — overload error suggests it's overdefined; remove redundant id if schema generates it OR add `id` to schema |
| `d1.ts:225` `createGrant` revoked field | `revoked: false` (not `0`) |
| `d1.ts:243, 256, 290` `eq(table.revoked, 0)` | `eq(table.revoked, false)` everywhere |
| `d1.ts:264, 273` `<` operator on `expiresAt` | use Drizzle `lt(table.expiresAt, new Date())` |

## d1.ts:105 chain bug

`db.select().from(events).where(...)` — but `.where()` is returning `Omit<SQLiteSelectBase<...>>` that doesn't have `.where()` anymore. Likely the prior `.from()` is misconfigured, or there's an extra `.execute()` collapsing the type. Inspect the full function.

## Hono route response-shape mismatches

`routes/api/sessions/{events,grants,subscribers}.ts` declare OpenAPI response shapes (e.g. `404: { schema: { error: string } }`) but handlers return shapes like `{ subscribers: [...] }` for the 200 case without a corresponding 200 schema. Fix one of:

- Add the 200 response schema to each route's `responses: { 200: { ... }, 404: { ... } }` definition; OR
- Return `c.json({ error: '...' }, 404)` explicitly for the 404 path instead of returning the data shape generically

Three affected files: `events.ts:54`, `grants.ts:70` + `:136`, `subscribers.ts:52`.

Also `events.ts:85` has a 1-arg call where 2-3 expected — likely the same as types.ts pattern.

## Verification

After all fixes:
```bash
pnpm run check  # should be clean
pnpm run db:generate:core  # should produce "No schema changes" (idempotent)
```

## Out of scope for the typecheck cleanup (deferred behavioral items)

These are NOT typecheck errors — `pnpm run check` is clean. They are
real runtime / coverage gaps still owed against the AgenticSession spec
and tracked separately:

- `factory.ts:createSession` calls `doStub.fetch('http://internal/create', ...)` which has no handler on the Phase 1 DO — runtime 404. Fix in a follow-up.
- The residual narrow sequence-counter race noted in PR #463.
- **S0-T15** — refactor `JulesWebhookBroadcaster` to delegate to AgenticSession (publish `jules.*` events into the session).
- **S0-T16** — refactor `JulesLiveProvider` context to wrap `useAgenticSession` filtered by `type: 'jules.*'`.

## Resolution notes

Migration 0013 was collapsed back into 0012 (changing the `revoked`
column DEFAULT from `0` to `false` in both the SQL and the snapshot).
0012 has not been applied to production — the SESSION_TOKEN_SECRET
hasn't been issued yet and no deploy has happened — so editing the
unreleased migration in place is safe and produces a cleaner history
than carrying a no-op table-rebuild as 0013.

`d1.ts` was the largest change: every consumer that fed unix-second
integers or `0`/`1` booleans was rewritten to feed `Date` and
`true`/`false` literals, matching the Drizzle `mode: 'timestamp'` and
`mode: 'boolean'` declarations. A new `listExpiredGrants` helper using
`lt(expiresAt, new Date())` was added at the same time.
