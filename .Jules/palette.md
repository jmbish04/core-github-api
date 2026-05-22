
## 2024-03-24 - Accessibility for Icon-Only Buttons
**Learning:** Found that multiple components (like ConfigTable) use icon-only buttons (`<Button size="icon">`) without providing `aria-label` or `title` attributes, making them inaccessible to screen readers and difficult to identify for sighted users who rely on tooltips.
**Action:** When adding or reviewing icon-only buttons, always ensure they include an `aria-label` attribute for screen reader accessibility and a `title` attribute for hover tooltips.
