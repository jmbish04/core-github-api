## 2024-06-17 - Missing labels in Assistant UI primitives
**Learning:** The `@assistant-ui/react` composer primitive components (`ComposerPrimitive.Dictate`, `ComposerPrimitive.StopDictation`, etc.) do not automatically generate `aria-label` or `title` attributes. When used as icon-only buttons, these attributes must be explicitly provided to ensure screen readers can announce them and visual users get hover tooltips.
**Action:** Always ensure that any icon-only button, including third-party primitives, has both `aria-label` and `title` attributes added manually.
