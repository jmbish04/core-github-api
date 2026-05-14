# Stitch Artifacts — gh_research_feature

Self-contained UX contract for the GitHub Research feature. Used by:

- **Stitch MCP** to generate HTML mockups per page
- **Current-agent (Claude Code)** to review mockups and assemble Jules briefs
- **Jules** to rebuild mockups into production React+Astro+shadcn

## Files in this folder

| File | Purpose |
|---|---|
| `DESIGN.md` | Monolith design system — verbatim Section 6 design-theme block, palette, typography, motion, separation rules, component patterns, anti-patterns |
| `SITE.md` | Sitemap, IA, page contracts, generation order across waves |
| `baton-schema.md` | Format for the `next-prompt-*.md` baton files |
| `next-prompt-*.md` | Per-page batons (one per page in the sitemap) |

## Baton coverage status

**P0 batons written (8/8):**
- `next-prompt-sessions-monitor.md` — Wave 1
- `next-prompt-session-transcript.md` — Wave 1
- `next-prompt-gh-library.md` — Wave 2
- `next-prompt-gh-intake.md` — Wave 2
- `next-prompt-gh-job-live.md` — Wave 2
- `next-prompt-gh-finding-detail.md` — Wave 2
- `next-prompt-gh-send-to-planning.md` — Wave 4
- `next-prompt-gh-promote-to-rules.md` — Wave 4
- `next-prompt-gh-health.md` — Wave 4

**P1 batons (generated during their respective Stitch loop wave — schema is established, just fill in the page-specific sections):**
- `next-prompt-gh-job-replay.md` — Wave 2 (replay scrubber UI on the live viewer)
- `next-prompt-gh-saved-searches.md` — Wave 3
- `next-prompt-gh-categories.md` — Wave 3
- `next-prompt-gh-weekly.md` — Wave 3 (weekly digest archive + config)
- `next-prompt-docs-template.md` — Wave 5 (docs page template, used for all `/docs/research/*` and `/docs/agentic-session/*` pages)

The orchestrator (current-agent) will write each P1 baton at the start of its wave by copying the baton-schema and filling in the page-specific sections from the SITE.md per-page contract. No separate planning step needed — the schema and SITE.md together fully specify each baton.

## How to use during a Stitch loop

1. Pick the next baton in SITE.md generation order
2. Run `mcp__stitch__generate_screen_from_text` with the baton's `Goal` + `Layout` + `States` sections, applying the Section 6 design-theme block via `apply_design_system`
3. Review the returned PNG against all states in Section 5. If gaps, send a surgical follow-up Stitch prompt.
4. When stable, the entire baton plus the HTML mockup becomes part of the Jules brief for the relevant EPIC
5. Jules rebuilds in React+Astro+shadcn, mirroring AGENTS.md conventions and the Monolith profile
6. Orchestrator reviews PR against Section 8 acceptance criteria

## Orchestration choice

Per Step-0 of the Stitch loop: **current-agent orchestrates, Jules executes the React rebuild**.

- Current-agent (Claude Code) generates Stitch prompts, reviews mockups, writes Jules briefs, monitors sessions, course-corrects via `send_session_message`.
- Jules picks up one EPIC at a time, rebuilds inside the assigned branch, opens PR to `feat/v8.1-migration`.
- Current-agent handles `wrangler.jsonc` edits, migrations, deploys, and the final integration verification matrix.

See `docs/gh_research_feature/PROMPT.md` for the full Jules kickoff brief.
