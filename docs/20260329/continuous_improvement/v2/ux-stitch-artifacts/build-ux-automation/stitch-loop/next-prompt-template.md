---
page: dashboard
status: todo
---

# 1) Description
A high-stakes data monolith for system monitoring. Vibe: Brutalist, Obsidian, Authoritative.

# 2) DESIGN SYSTEM (REQUIRED)
- **Palette:** Zinc Dark / Obsidian (oklch(0.145 0 0)).
- **The No-Line Rule:** Use tonal shifts (surface-container-low) and negative space (8/12 scale) for boundaries. NO borders.
- **Constraints:** - NO user profiles or avatars (System-First).
    - NO search inputs.
    - Sharp 0.25rem corners only.

# 3) Page Structure
1. **Collapsible Sidebar:** Navigation for system-level primitives (Storage, Compute, Logs).
2. **Main Canvas:** Asymmetric grid of Zinc-depth containers.
3. **Data Grid:** High-contrast White-on-Dark typography for raw utility.

# 4) Technical Requirements
- components: [shadcn/ui Sidebar, shadcn/ui Card, assistant-ui Thread]
- viewport: [Desktop: 1440x900, Mobile: 390x844]
- sidebar: Collapsible (default open: false)

# Validation Rules
- [ ] NO user profile icons present?
- [ ] Sidebar present and collapsible?
- [ ] All borders removed in favor of tonal shifts?