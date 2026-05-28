## 2024-05-28 - Missing ARIA Labels on Icon Buttons
**Learning:** Found a pattern of missing `aria-label` and `title` attributes on `<Button size="icon">` elements across the UI, particularly in modals and settings. Icon-only buttons without these attributes are completely opaque to screen readers and difficult for sighted users to decipher without hover tooltips.
**Action:** When adding or reviewing `<Button size="icon">` usage, always ensure `aria-label` is present for screen readers and `title` is present to provide hover tooltips for sighted users.
