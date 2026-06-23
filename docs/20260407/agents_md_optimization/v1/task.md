# AGENTS.md Token Optimization — Task Tracker

## Phase 1: Verification & Prep
- [x] Audit `.antigravityignore` — `docs/` already present ✅
- [x] Audit `.geminiignore` — missing `docs/`, needs update
- [ ] Update `.geminiignore` to include `docs/`

## Phase 2: Archive & Move
- [ ] Create `docs/archive/` directory
- [ ] Move Research Team spec (AGENTS.md L197–252) → `docs/archive/research-team-spec.md`

## Phase 3: Rule File Merges (8 merges, 8 deletions)
- [ ] `ai-rules.md` ← absorb `ai-routing.md` + GenAI SDK patterns from AGENTS.md
- [ ] Delete `ai-routing.md`
- [ ] `cloudflare-standards.md` ← absorb `cloudflare-deployments.md`
- [ ] Delete `cloudflare-deployments.md`
- [ ] `workspace-awareness.md` ← absorb `infrastructure-standards.md`
- [ ] Delete `infrastructure-standards.md`
- [ ] `03-responsive-design.md` ← absorb `ui-standards.md`
- [ ] Delete `ui-standards.md`
- [ ] `traceability-logging.md` ← absorb `logging-standards.md`
- [ ] Delete `logging-standards.md`
- [ ] `02-do-abstraction.md` ← absorb `durable-object-agents.md` + `durable_objects.md`
- [ ] Delete `durable-object-agents.md`
- [ ] Delete `durable_objects.md`
- [ ] `000-bootstrap.md` ← absorb `hygiene-standards.md`
- [ ] Delete `hygiene-standards.md`

## Phase 4: New Rule Files
- [ ] Create `exit-criteria.md` (from AGENTS.md L188–195)

## Phase 5: Rewrite AGENTS.md
- [ ] Replace 439-line AGENTS.md with ~80-line TOC

## Phase 6: Verification
- [ ] Count AGENTS.md lines (target < 100)
- [ ] Count rule files (target ~38)
- [ ] Verify no content was lost
