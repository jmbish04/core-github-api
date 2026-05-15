## 2024-05-15 - ARIA Labels on Icon-Only Buttons
**Learning:** Found an icon-only button (Back arrow) in PRCommandCenter that lacked accessible text. Adding `aria-label` provides crucial context for screen reader users without altering the visual design.
**Action:** Always check icon-only buttons (`size="icon"`) for missing `aria-label` or `title` attributes during accessibility reviews.
