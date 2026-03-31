# Baton File Schema

The communication protocol between you and the Stitch agent.

The baton file (`next-prompt.md`) orchestrates the iterative build loop.

## Format

```yaml
---
page: <filename>
status: <current_status>
---
<prompt-content>
# Mandatory Body Sections
1) One-line description: High-level purpose with vibe keywords.

2) DESIGN SYSTEM (REQUIRED): Copy Section 6 from your DESIGN.md.

3) Page Structure: Numbered list of layout sections.

4) Technical Requirements: Specific components (Shadcn/Kibo) or hooks needed.

Validation Rules
 - [ ] Does the page match a route in SITE.md?
 - [ ] Are both Desktop and Mobile versions described?
 - [ ] Does the prompt explicitly forbid borders?
</prompt-content>
```
