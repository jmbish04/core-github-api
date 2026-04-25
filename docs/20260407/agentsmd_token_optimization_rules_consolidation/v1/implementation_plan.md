# AGENTS.md Token Optimization & Rules Consolidation

Reduce AGENTS.md from **~7,841 tokens** (439 lines) to **~1,500 tokens** (~80 lines) by eliminating duplication and transforming it into a lean routing index.

## User Review Required

> [!IMPORTANT]
> The "Antigravity Strategy: Agentic Research Team" section (lines 197–252) is essentially a **backlog/task spec**, not a rule. This should be moved to a planning document (e.g., `docs/research-team-spec.md`) rather than being loaded in every agent context window. **Confirm you want it removed from AGENTS.md entirely.**

> [!WARNING]
> Several `.agent/rules/` files have significant overlap and can be merged. This will reduce the total rule count from **46 → ~35 files**, saving additional tokens. Confirm you're fine with file deletions.

## Analysis: Duplication Map

### AGENTS.md Sections → Already Covered by `.agent/rules/`

| AGENTS.md Section | Lines | Covered By | Action |
|---|---|---|---|
| Cloudflare Bindings & Naming | 3–6 | `cloudflare-deployments.md` (lines 12–17) ✅ identical | **DELETE from AGENTS.md** |
| PNPM Workspace Commands | 24–59 | `workspace-awareness.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| Package Management (PNPM) | 73–85 | `workspace-awareness.md` + `infrastructure-standards.md` ✅ | **DELETE from AGENTS.md** |
| Core Directives (GenAI SDK) | 61–71 | Partially in `ai-rules.md` ❌ SDK pattern NOT covered | **MERGE into `ai-rules.md`** |
| Code Patterns (GenAI SDK) | 87–114 | NOT in any rule file | **MERGE into `ai-rules.md`** |
| Global Env / Forbidden Imports | 70–71 | `globals.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| DO Abstraction | 116–121 | `02-do-abstraction.md` ✅ full duplicate (already cross-referenced) | **DELETE from AGENTS.md** |
| Structured Outputs | 123–150 | `ai-rules.md` ✅ 90% overlap | **DELETE from AGENTS.md** |
| AI Provider Routing | 152–160 | `ai-routing.md` ❌ missing import path mandate | **MERGE into `ai-routing.md`** |
| Full-Code Output | 162–170 | `full-code-output.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| MCP Tools | 172–177 | Minimal (1 line) — not worth a standalone section | **Inline into AGENTS.md TOC** |
| Container/Sandbox Protocol | 178–186 | `sandbox-sdk.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| Exit Criteria | 188–195 | NOT in any rule file ❌ | **NEW rule: `exit-criteria.md`** |
| Research Team Strategy | 197–252 | NOT a rule — it's a backlog/spec | **MOVE to `docs/`** |
| Cross-Repository Architecture | 254–257 | `cross-repo-architecture.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| Global Error Handling | 259–271 | `error-handling.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| Traceability & Logging | 273–315 | `traceability-logging.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| D1 & Drizzle Governance | 317–393 | `d1-drizzle-governance.md` ✅ full duplicate (MORE detail in rule file) | **DELETE from AGENTS.md** |
| GitHub Webhook Architecture | 395–429 | `github-webhooks.md` ✅ full duplicate | **DELETE from AGENTS.md** |
| Mobile-First Responsive | 431–438 | `03-responsive-design.md` ✅ full duplicate | **DELETE from AGENTS.md** |

### `.agent/rules/` Overlap Consolidation

| Files to Merge | Rationale | Target File |
|---|---|---|
| `ai-rules.md` + `ai-routing.md` | Both < 15 lines, same domain | **`ai-rules.md`** (rename: AI SDK, Structured Output & Routing) |
| `logging-standards.md` + `traceability-logging.md` | Both about logging; `traceability-logging.md` is superset | **`traceability-logging.md`** → absorb unique "Glass Box" content |
| `error-handling.md` ← already standalone | No merge needed, but AGENTS.md copy can be deleted | Keep as-is |
| `cloudflare-standards.md` + `cloudflare-deployments.md` | Closely related CF rules split across two small files | **`cloudflare-standards.md`** (unified) |
| `infrastructure-standards.md` + `workspace-awareness.md` | Both pnpm/monorepo rules, largely redundant | **`workspace-awareness.md`** (absorb infra uniqueness) |
| `ui-standards.md` + `03-responsive-design.md` | Both UI rules, `ui-standards.md` is only 4 lines | **`03-responsive-design.md`** (add sticky header + icon rules) |
| `durable-object-agents.md` + `durable_objects.md` | Two DO rule files with overlapping scope | **`02-do-abstraction.md`** (merge all 3 into one DO rule) |
| `hygiene-standards.md` | 3 short bullets — can be appended to `000-bootstrap.md` | **`000-bootstrap.md`** |

---

## Proposed Changes

### AGENTS.md → Lean TOC

#### [MODIFY] [AGENTS.md](file:///Volumes/Projects/workers/core-github-api/AGENTS.md)

Replace entire 439-line file with a ~80-line table of contents that routes agents to the correct `.agent/rules/` file.

---

### Rule File Merges

#### [MODIFY] [ai-rules.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/ai-rules.md)
- Absorb GenAI SDK patterns (correct/incorrect code patterns) from AGENTS.md lines 61–114
- Absorb AI Provider Routing import mandates from AGENTS.md lines 152–160
- Absorb `ai-routing.md` content (3 bullets)

#### [DELETE] [ai-routing.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/ai-routing.md)
- Content merged into `ai-rules.md`

#### [MODIFY] [cloudflare-standards.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/cloudflare-standards.md)
- Absorb `cloudflare-deployments.md` content (bundle protections + bindings philosophy)

#### [DELETE] [cloudflare-deployments.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/cloudflare-deployments.md)
- Content merged into `cloudflare-standards.md`

#### [MODIFY] [workspace-awareness.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/workspace-awareness.md)
- Absorb `infrastructure-standards.md` unique content (pnpm dlx, .npmrc, npx ban)

#### [DELETE] [infrastructure-standards.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/infrastructure-standards.md)
- Content merged into `workspace-awareness.md`

#### [MODIFY] [03-responsive-design.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/03-responsive-design.md)
- Absorb `ui-standards.md` (sticky header, cog wheel, lucide-react, config URL pattern)

#### [DELETE] [ui-standards.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/ui-standards.md)
- Content merged into `03-responsive-design.md`

#### [MODIFY] [traceability-logging.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/traceability-logging.md)
- Absorb `logging-standards.md` "Glass Box" principle and structured metadata rules

#### [DELETE] [logging-standards.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/logging-standards.md)
- Content merged into `traceability-logging.md`

#### [MODIFY] [02-do-abstraction.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/02-do-abstraction.md)
- Absorb `durable-object-agents.md` (Agents SDK first, dynamic imports, AI Gateway routing)
- Absorb `durable_objects.md` content

#### [DELETE] [durable-object-agents.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/durable-object-agents.md)
#### [DELETE] [durable_objects.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/durable_objects.md)
- Content merged into `02-do-abstraction.md`

#### [MODIFY] [000-bootstrap.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/000-bootstrap.md)
- Absorb `hygiene-standards.md` (3 bullet points about .antigravityignore, temp files, rule consolidation)

#### [DELETE] [hygiene-standards.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/hygiene-standards.md)
- Content merged into `000-bootstrap.md`

---

### New Files

#### [NEW] [exit-criteria.md](file:///Volumes/Projects/workers/core-github-api/.agent/rules/exit-criteria.md)
- Exit criteria currently only in AGENTS.md (lines 188–195): lint check + dry-run verification
- Small file (~10 lines)

#### [NEW] [research-team-spec.md](file:///Volumes/Projects/workers/core-github-api/docs/research-team-spec.md)
- Moves the "Antigravity Strategy: Agentic Research Team" section (lines 197–252) out of AGENTS.md into docs/
- This is a project spec/backlog, not an operational rule

---

## Token Budget Impact (Estimated)

| Item | Current | After |
|---|---|---|
| **AGENTS.md** | ~7,841 tokens (439 lines) | **~1,500 tokens** (~80 lines) |
| **Rule files merged** | 8 files deleted | Content absorbed into 8 existing files |
| **Net rule file count** | 46 files | **~38 files** |
| **Net token savings** | — | **~6,000+ tokens** from AGENTS.md alone |
| **Additional savings** | — | ~2,000 tokens from rule deduplication |

## Open Questions

> [!IMPORTANT]
> 1. **Research Team Spec**: Should it go to `docs/research-team-spec.md` or be deleted entirely? It has unchecked task items that may be stale.
> 2. **"Localized Agent Documentation" section**: Should the AGENTS.md TOC keep the cross-references to subdirectory AGENTS.md files (e.g., `src/backend/src/ai/agents/AGENTS.md`), or are those also redundant with the `.agent/rules/` system?

## Verification Plan

### Automated Tests
- After changes, run `wc -l AGENTS.md` to confirm < 100 lines
- Run `ls .agent/rules/ | wc -l` to confirm reduced file count
- Run `wc -c .agent/rules/*.md | tail -1` to measure total rule bytes

### Manual Verification
- Review the new AGENTS.md TOC for completeness
- Spot-check 3 merged rule files to ensure no content was lost
