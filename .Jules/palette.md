## 2024-05-19 - Missing Aria Labels on Icon-Only Buttons
**Learning:** Icon-only buttons without `aria-label` and `title` attributes lead to poor accessibility for screen readers and lack of context for sighted users via tooltips, a pattern observed across authentication (`numeric-keypad.tsx`) and layout (`RepoFolder.tsx`) components.
**Action:** Consistently enforce the addition of descriptive `aria-label` and `title` attributes on all icon-only buttons to guarantee screen reader compatibility and visible tooltips on hover.
