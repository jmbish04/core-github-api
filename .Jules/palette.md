## 2024-06-16 - Dictation Buttons Missing Accessibility Context
**Learning:** Found that `@assistant-ui/react` composer primitive components (e.g., `ComposerPrimitive.Dictate`, `ComposerPrimitive.StopDictation`) do not automatically inherit or generate `aria-label` or `title` attributes when used as icon-only buttons, reducing accessibility for screen readers and providing no visual tooltips for users.
**Action:** When implementing new custom chat composer interfaces with icon-only actions, ensure that `aria-label` and `title` attributes are explicitly provided to all interactive primitives.
