
## 2024-05-15 - Hover-Revealed Elements and Keyboard Navigation
**Learning:** Adding `opacity-0 group-hover:opacity-100` to interactive elements (like icon buttons) hides them visually but doesn't prevent focus, meaning keyboard users can focus an invisible button. However, even if they focus it, it remains invisible unless `focus-within:opacity-100` is used on the parent container.
**Action:** When implementing hover-revealed UI elements, always move the `opacity-0 group-hover:opacity-100` classes to the parent wrapper and add `focus-within:opacity-100`. Then, add appropriate `focus-visible:ring-1` (or similar focus rings) to the child interactive elements to ensure they become visible and clearly focused during keyboard navigation.
