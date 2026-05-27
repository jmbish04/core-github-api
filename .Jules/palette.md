
## 2024-05-18 - Icon-Only Button Accessibility in Config Table
**Learning:** Config tables often rely heavily on icon-only buttons (like Edit/Save/Cancel) to save horizontal space, which frequently lack proper ARIA labels and tooltips, causing severe accessibility and usability issues for screen reader users and those navigating complex settings.
**Action:** Always ensure icon-only buttons in dense data tables or lists include `aria-label` and `title` attributes. Additionally, include visual loading states directly within the button for async actions (like Save) to prevent user confusion.
