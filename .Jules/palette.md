## 2024-05-21 - Accessible Inline Data Table Actions
**Learning:** Icon-only buttons used for inline row actions in data tables (like edit, save, cancel) are completely invisible to screen readers without ARIA labels, and confusing to sighted users without tooltips. This is especially problematic in dense tables where context isn't obvious.
**Action:** Always ensure any icon-only button, regardless of its placement inside complex components like tables, includes both an `aria-label` and `title` attribute explaining its function.
