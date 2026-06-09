## 2024-06-09 - Missing Accessible Labels on Icon-Only Buttons
**Learning:** Found a common pattern of icon-only buttons (e.g., Refresh buttons, Add buttons) lacking `aria-label` and `title` attributes, which hinders screen reader users and sighted users relying on tooltips.
**Action:** When adding or reviewing icon-only buttons, always ensure they include both `aria-label` for screen readers and `title` for hover tooltips.
