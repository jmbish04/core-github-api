## 2025-02-20 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Many icon-only buttons across the app (like 'New Discussion' and 'Send Message') are missing 'aria-label' attributes and hover 'title' attributes. This makes them inaccessible to screen readers and confusing for users who need text descriptions.
**Action:** Always verify that 'aria-label' and 'title' attributes are added to any button or interactive element that relies solely on icons (e.g. `size="icon"`).
