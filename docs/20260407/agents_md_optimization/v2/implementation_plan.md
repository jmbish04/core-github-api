# AGENTS.md Token Optimization & Rules Consolidation

This plan aims to reduce `AGENTS.md` from **~7,841 tokens** (439 lines) to **~1,500 tokens** (~80 lines) by eliminating duplication and transforming it into a lean routing index.

## User Review Required

> [!IMPORTANT]
> The "Antigravity Strategy: Agentic Research Team" section is essentially a **backlog/task spec**, not a rule. This should be moved to a planning document (e.g., `docs/research-team-spec.md`) rather than being loaded in every agent context window. **Confirm you want it removed from AGENTS.md entirely.**

> [!WARNING]
> Several `.agent/rules/` files have significant overlap and can be merged. This will reduce the total rule count from **46 → ~38 files**, saving additional tokens. Confirm you're fine with file deletions.

## Proposed Changes

### 1. `AGENTS.md` Consolidation
Replace the entire 439-line file with a compact ~80-line table of contents that routes agents to the correct `.agent/rules/` file. The removed content will exist entirely in `.agent/rules/` files.

- Delete duplicated sections:
  - Cloudflare Bindings & Naming
  - PNPM Workspace Commands & Package Management
  - Global Env / Forbidden Imports
  - DO Abstraction
  - Structured Outputs
  - Full-Code Output
  - Container/Sandbox Protocol
  - Cross-Repository Architecture
  - Global Error Handling
  - Traceability & Logging
  - D1 & Drizzle Governance
  - GitHub Webhook Architecture
  - Mobile-First Responsive

### 2. Rule File Merges

| Source File(s) (ToBeMerged/Deleted) | Target File (To absorb content) | Action |
|---|---|---|
| `ai-routing.md` | `ai-rules.md` | Absorb GenAI SDK patterns (from `AGENTS.md`) and routing instructions into `ai-rules.md`. Delete `ai-routing.md`. |
| `cloudflare-deployments.md` | `cloudflare-standards.md` | Merge and delete `cloudflare-deployments.md`. |
| `infrastructure-standards.md` | `workspace-awareness.md` | Absorb infra uniqueness into `workspace-awareness.md`. Delete `infrastructure-standards.md`. |
| `ui-standards.md` | `03-responsive-design.md` | Add sticky header + icon rules. Delete `ui-standards.md`. |
| `logging-standards.md` | `traceability-logging.md` | Absorb "Glass Box" principle. Delete `logging-standards.md`. |
| `durable-object-agents.md`, `durable_objects.md` | `02-do-abstraction.md` | Merge DO rules. Delete `durable-object-agents.md` & `durable_objects.md`. |
| `hygiene-standards.md` | `000-bootstrap.md` | Append short bullets. Delete `hygiene-standards.md`. |

### 3. New Files Added
- `exit-criteria.md`: Moving lines 188-195 of `AGENTS.md`.
- `docs/research-team-spec.md` (Subject to user answer for Open Question #1).

## Open Questions

> [!IMPORTANT]
> 1. **Research Team Spec**: Should the section "Antigravity Strategy: Agentic Research Team" go to `docs/research-team-spec.md` or be deleted entirely? It has unchecked task items that may be stale.
> 2. **"Localized Agent Documentation" section**: Should the `AGENTS.md` TOC keep the cross-references to subdirectory `AGENTS.md` files (e.g., `src/backend/src/ai/agents/AGENTS.md`), or are those also redundant with the `.agent/rules/` system?

## Verification Plan

### Automated Tests
- Run `wc -l AGENTS.md` to confirm < 100 lines.
- Run `ls .agent/rules/ | wc -l` to confirm reduced file count (~38 total rule files).

### Manual Verification
- Review the new `AGENTS.md` TOC for completeness.
- Spot-check 3 merged rule files to ensure no content was lost.
