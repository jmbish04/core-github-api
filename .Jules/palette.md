## 2024-06-01 - Add context to icon-only buttons
**Learning:** Found that icon-only buttons (like Send or Stop in chat interfaces) often lack both `aria-label` for screen readers and `title` for sighted users simultaneously. This breaks accessibility and degrades UX for users relying on mouse-hover tooltips for clarity.
**Action:** Always ensure icon-only buttons get an explicit `aria-label` attribute and a matching `title` attribute for tooltip rendering.
