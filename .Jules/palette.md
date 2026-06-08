## 2024-10-24 - Resolving Invisible Keyboard Focus in Hover Actions
**Learning:** When using `opacity-0 group-hover:opacity-100` for quick action buttons (like favorites or delete), keyboard navigators lose track of focus because the element stays invisible. Using `focus-within:opacity-100` on the container correctly surfaces the hidden buttons when a user tabs into them.
**Action:** Always pair `group-hover:opacity-100` with `focus-within:opacity-100` on the container, and ensure internal elements use `focus-visible:ring-1` for clear outlines.
