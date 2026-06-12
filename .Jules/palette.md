## 2024-06-12 - Missing Keyboard Focus on Hover Actions
**Learning:** Found multiple instances where hover actions (`opacity-0 group-hover:opacity-100`) lack `focus-within` equivalents, hiding them from keyboard users.
**Action:** Adding `focus-within:opacity-100` alongside `group-hover:opacity-100` ensures accessibility for interactive elements.
