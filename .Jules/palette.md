## 2026-05-16 - Header Icon Actions Need Accessibility
**Learning:** Icon-only action buttons in global headers (like documentation, notifications, user profiles) are a common pattern in the app but frequently lack `aria-label` and `title` attributes, causing screen readers to announce them as blank or simply "button", and leaving sighted users without hover tooltips.
**Action:** Always verify icon-only buttons include descriptive `aria-label` attributes and `title` tooltips, especially in global layouts and headers.
