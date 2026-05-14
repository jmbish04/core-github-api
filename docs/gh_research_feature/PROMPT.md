# Kickoff Prompt — gh_research_feature (Jules sessions)

> **You are picking up implementation of the `gh_research_feature` on the `jmbish04/core-github-api` Cloudflare Worker.** This file is the single source of truth for how to run a Jules session for any EPIC in this feature. Read this file, then read your assigned EPIC's task list, then execute.

---

## 1. Repository

- **Repo:** `jmbish04/core-github-api`
- **Base branch:** `feat/v8.1-migration` (must be checkpointed clean before you start)
- **Your branch pattern:** `feat/gh-research/epic-{N}-{slug}` (see your EPIC entry in `docs/gh_research_feature/TASKS.json`)
- **PR target:** open against `feat/v8.1-migration`, NOT `main`

## 2. Mandatory reading order

Before writing any code, read in this order:

1. `AGENTS.md` — root project briefing
2. `docs/gh_research_feature/PRD.md` — full product requirements
3. `docs/gh_research_feature/TASKS.json` — find YOUR assigned EPIC; read its `tasks[]`
4. `.agent/rules/agentic-session.md` (if it exists yet — created in EPIC-12)
5. `.agent/rules/gh-research.md` (if it exists yet — created in EPIC-12)
6. `.agent/rules/shadcn-conventions.md` (if it exists yet — created in EPIC-11)
7. `docs/gh_research_feature/stitch/DESIGN.md` — Monolith design system; you MUST follow this for any UI work
8. `docs/gh_research_feature/stitch/SITE.md` — sitemap + IA
9. Any `docs/gh_research_feature/stitch/next-prompt-*.md` baton scoped to a page you're rebuilding

---

## 3. STANDING RULES (NEVER violate)

These rules are inherited from `AGENTS.md` and Cloudflare-jedi. They apply to every task you pick up.

### Architecture

- **Stack is non-negotiable:** Hono + `@hono/zod-openapi` → D1 + Drizzle + drizzle-zod → Astro SSR + shadcn/ui → Agents SDK + AI Gateway. pnpm. TypeScript end-to-end.
- **Env is a global interface** — never import it, never redefine it. Just use it.
- **`worker-configuration.d.ts` is AUTO-GENERATED** by `wrangler types`. Never edit it manually.
- **`/openapi.json`, `/scalar`, `/swagger`** must remain dynamic — never hardcode schemas.

### Frontend (anything React/Astro)

- **NEVER** `window.alert / confirm / prompt` — use shadcn `Dialog` or `AlertDialog`.
- **NEVER** mock/placeholder data — every value flows from a real API.
- **NEVER** 1px borders for separation — use `ring-1 ring-border/40`, `divide-y divide-border/40`, or `bg-card`.
- **ALWAYS** dark theme — wrap root in `<html class="dark">`.
- **ALWAYS** Monolith profile (per `stitch/DESIGN.md`) — palette, typography, no-borders rule, OKLCH chart palette, high-contrast labels.
- **ALWAYS** wrap Recharts in shadcn `<ChartContainer>` with OKLCH overrides. **Never** Chart.js / Plotly / Nivo / Apex / Highcharts / ECharts.
- **ALWAYS** route errors through the global `ErrorLogger` — never swallow silently.
- **ALWAYS** `<Navbar />` on every page.
- **ALWAYS** mobile-responsive with collapsible sidebar.
- **ALWAYS** sort + filter on any data table.

### Modularization

- **Schemas:** one file per table under `backend/src/db/schemas/<category>/<subcategory>/<table>.ts`. Folder `index.ts` re-exports. Consumers import from the folder.
- **Agents:** `backend/src/ai/agents/<agentName>/{types,health,index}.ts` + `methods/` subfolder. Never one giant file.
- **Providers:** `backend/src/ai/providers/<providerName>.ts` + folder `index.ts`. Never inline.
- **Services:** `backend/src/services/<serviceName>/...` with `index.ts` as the public surface.

### Database

- **NEVER** hand-write a migration. Always `pnpm run db:generate` (the current-agent will run this, not you).
- **NEVER** hand-edit a generated migration file after generation.

### Deployment

- **NEVER** `wrangler deploy` directly. Always `pnpm run deploy` (current-agent runs this).

### AgenticSession integration (EVERY long-running operation)

- Every workflow step, every multi-turn LLM call, every Jules-orchestration, every HITL flow **MUST** publish progress events to its AgenticSession. Never run silently.
- Session ids are UUIDs. Never reuse a session id across distinct work units.
- **Never** write to `session_events` directly — always go through `SessionClient.publish`.
- When introducing a new event type, register it in `services/agentic-session/types.ts` discriminated union AND document it in `/docs/agentic-session/events.md`.
- Authorize subscribers via grants; never expose a session websocket unauthenticated.
- The three legacy DOs (`JulesWebhookBroadcaster`, `RoomDO`, `AgentSessionDO`) are deprecated — new features MUST use AgenticSession.

### gh-research-specific rules

- **Never** put the gh-research health suite on a cron. On-demand only. (Cost reason.)
- Every workflow step publishes a structured event to the session. No silent steps.
- Source dedup goes through `gh_research_sources_seen`. Never bypass.
- Jules is reserved for the synthesize step only. Search/read/reflect stay in the worker + Sandbox.
- Findings promoted to `.agent/rules/*` must carry a provenance footer linking back to job + source ids.

---

## 4. Tools you have

- **Bash** for `git`, `pnpm install`, `pnpm typecheck`, `pnpm test`, `gh search repos`, `gh search code`, `gh pr view`, file moves
- **File editors** for code changes
- **GitHub PR creation** when your work is complete on the branch

You do **NOT** have:
- Direct `wrangler deploy` (the orchestrator handles deploy)
- The ability to edit `worker-configuration.d.ts` (auto-generated)
- Permission to skip pre-commit hooks (never use `--no-verify`)

---

## 5. Acceptance flow

1. **Read** mandatory files (§2) + your EPIC tasks
2. **Plan** locally — write a 5–10 line plan in the session before coding
3. **Code** per Cloudflare-jedi modularization rules
4. **Test** — write Vitest coverage for every new method (see your EPIC's testing tasks)
5. **Self-review** against your EPIC's `acceptance[]` array in `TASKS.json`
6. **Open PR** to `feat/v8.1-migration` with title `[EPIC-{N}] {summary}` and body:
   - Bulleted list of what changed
   - Link to PRD section(s) implemented
   - Acceptance criteria checklist
   - Test plan (commands to verify)
7. **Wait** for orchestrator review. Course-correct via `send_session_message` from the orchestrator.

---

## 6. Common pitfalls (read these or you WILL waste cycles)

- **Don't put schemas in one flat file.** One file per table. Folder `index.ts` re-exports. This is enforced.
- **Don't write `if (!env.FOO) throw`** — `Env` is global; use bindings directly. Failure-to-bind manifests at worker startup, not in your code path.
- **Don't import from `@/components/ui/button.tsx`** etc. — import from `@/components/ui` (the barrel).
- **Don't use `getServerSession`-style auth patterns** — this worker uses session JWTs through AgenticSession or API keys via headers. See `auth.ts`.
- **Don't add a new cron** unless the EPIC explicitly says so. The gh-research health suite is on-demand only.
- **Don't bypass `SessionClient.publish`** — even for tiny status updates. The transcript is the user's eyes; silent steps are user-visible bugs.
- **Don't write `console.log`** — use `this.logger.info(...)` in agents, `logger` elsewhere.

---

## 7. Per-EPIC quick reference

| EPIC | Wave | Branch | Headline deliverable |
|---|---|---|---|
| EPIC-0 | 1 | `feat/gh-research/epic-0-agentic-session` | Reusable session service + DO + hook + monitor |
| EPIC-1 | 2 | `feat/gh-research/epic-1-schema` | 10-table gh-research schema + `v_gh_research_trail` view |
| EPIC-2 | 3 | `feat/gh-research/epic-2-sandbox` | `ghClone/ghInspect/ghSnapshot/ghDestroy` helpers |
| EPIC-3 | 3 | `feat/gh-research/epic-3-iterative-refine` | Plan→search→read→reflect→refine loop |
| EPIC-4 | 4 | `feat/gh-research/epic-4-jules-synthesis` | Jules synthesis bridge with event mirroring |
| EPIC-5 | 4 | `feat/gh-research/epic-5-workflow` | `GhResearchWorkflow` + `runGhResearchJob` |
| EPIC-6 | 4 | `feat/gh-research/epic-6-api` | `/api/research/gh/*` Hono routes |
| EPIC-7 | 5 | `feat/gh-research/epic-7-frontend` | Library + intake + live viewer + replay |
| EPIC-8 | 5 | `feat/gh-research/epic-8-promotions` | Send-to-Planning + Promote-to-Rules |
| EPIC-9 | 3 | `feat/gh-research/epic-9-docs` | `/docs/research/*` + `/docs/agentic-session/*` |
| EPIC-10 | 5 | `feat/gh-research/epic-10-health` | On-demand health suite + dashboard |
| EPIC-11 | 2 | `feat/gh-research/epic-11-shadcn-audit` | Native shadcn audit + migration |
| EPIC-12 | 2 | `feat/gh-research/epic-12-governance` | AGENTS.md + `.agent/rules/*.md` |
| EPIC-13 | 5 | `feat/gh-research/epic-13-vectorize` | Vector indexing + find-similar |
| EPIC-14 | 5 | `feat/gh-research/epic-14-orchestrator-wake` | Auto-promote-to-planning hook |
| EPIC-15 | 6 | `feat/gh-research/epic-15-verification` | Full e2e verification (orchestrator runs this) |

---

## 8. When in doubt

- The PRD is authoritative; if anything in this file conflicts, the PRD wins.
- If the PRD is ambiguous, ask the orchestrator via `send_session_message` — do not guess on architecture.
- If a rule conflicts with what the user asks in a session message, the user wins for that session, but flag the conflict so the orchestrator can decide whether to update the rule.

---

## 9. Sign-off

Before submitting your PR, you should be able to honestly answer YES to all of:

- [ ] Did I read all files in §2?
- [ ] Does every long-running operation publish to AgenticSession?
- [ ] Does my schema work follow the per-table file + folder index.ts pattern?
- [ ] Are all UI changes pure shadcn (no lookalikes)? Dark theme? No 1px borders? Monolith chart palette?
- [ ] Did I write Vitest coverage for every new method?
- [ ] Does `pnpm typecheck` pass cleanly?
- [ ] Did I update relevant docs in `/docs/research/*` or `/docs/agentic-session/*` if my changes are user-visible?

If you can answer YES, open the PR. If you can't, fix the gap first.
