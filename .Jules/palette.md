
## 2025-02-12 - Accessible Icon-Only Buttons
**Learning:** Icon-only buttons (like delete, edit, or check marks) without `aria-label` or `title` attributes are completely invisible to screen readers, creating a major accessibility barrier. Similarly, missing focus-visible classes makes them inaccessible to keyboard users.
**Action:** Always add descriptive `aria-label` and `title` attributes, along with `focus-visible:outline-none focus-visible:ring-2` styles, whenever implementing icon-only interactive elements in the application.
