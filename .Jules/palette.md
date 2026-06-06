## 2024-06-06 - Numeric Keypad Accessibility
**Learning:** Found a custom numeric keypad component where the delete button only contained an icon (`<Delete className="h-6 w-6" />`) without any `aria-label` or `title`. This makes it completely opaque to screen readers and doesn't provide hover context for sighted users.
**Action:** Always add `aria-label` and `title` to icon-only buttons, especially in custom input components like keypads where context isn't provided by standard form elements.
