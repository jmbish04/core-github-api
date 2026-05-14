# Design System Strategy: Monolithic Precision

## 1. Overview & Creative North Star
This design system is anchored by the Creative North Star of **"Monolithic Precision."** It is a rejection of the "soft" web—moving away from friendly rounds, exuberant colors, and cluttered interfaces. Instead, it draws inspiration from architectural brutalism and high-end editorial typography. 

The system treats the Repo Dashboard not as a utility tool, but as a digital sanctuary for code. By utilizing heavy negative space, extreme typographic contrast, and a strictly tonal color palette, we create an environment of intense focus. We break the "template" look by favoring intentional asymmetry; elements are anchored to a rigid grid but separated by vast "silence" (white space), making every line of code and every repository name feel monumental.

---

## 2. Colors & Surface Architecture
The palette is a study in Zinc and Shadow. We move beyond flat design by utilizing "Tonal Layering" to define structure without the crutch of 1px borders.

### The "No-Line" Rule
**Borders are prohibited.** In this system, boundaries are defined exclusively through tonal shifts. A section is not "contained"; it is "situated" by moving from the base `surface` (#131315) to a `surface-container` (#1c1b1d). 

### Surface Hierarchy
To create depth, we stack containers using the following logic:
*   **Base Layer:** `surface` (#131315) – The foundation.
*   **Content Blocks:** `surface-container` (#1c1b1d) – For repo cards and primary modules.
*   **Interactive/Hover States:** `surface-container-high` (#201f22) or `highest` (#2a2a2c).
*   **The Glass Clause:** For floating navigation or context menus, use a semi-transparent `surface-container-highest` with a `24px` backdrop blur. This provides a "frosted obsidian" effect that feels premium and integrated.

### Signature Textures
Avoid flat, "dead" blacks. Use a subtle linear gradient on large `display-lg` text or primary surfaces (transitioning from `on-surface` to `on-surface-variant`) to mimic the way light hits physical brushed metal.

---

## 3. Typography: Editorial Authority
We use **Inter** exclusively, but we manipulate its personality through aggressive tracking and scale.

*   **The Headline Signature:** All headlines (`display-lg`, `headline-sm`) must use `letter-spacing: -0.05em`. This "tight" tracking creates a dense, authoritative visual block that feels custom-set by a typographer.
*   **Display-LG (3.5rem):** Reserved for repo titles or primary stats. It should be Pure White (#FFFFFF) to pierce the dark background.
*   **Headline-SM (1.5rem):** Used for section headers.
*   **Label-SM (0.6875rem):** Used for metadata (e.g., commit hashes, file sizes). These should be uppercase with slightly increased tracking (+0.05em) to maintain legibility at micro-scales.
*   **Body Text:** Use "Muted Zinc" (`on-surface-variant`). This ensures the user's focus remains on the structural headlines and the code itself.

---

## 4. Elevation & Depth
This system eschews traditional shadows for **Tonal Stacking.**

*   **The Layering Principle:** Depth is achieved by "nesting." A `surface-container-low` card sitting on a `surface` background creates a natural, soft lift.
*   **Ambient Shadows:** If a floating element (like a modal) requires separation, use an ultra-diffused shadow: `box-shadow: 0 20px 80px rgba(0, 0, 0, 0.45)`. Never use high-opacity or "sharp" shadows.
*   **The Ghost Border:** If accessibility contrast ratios fail, use a "Ghost Border"—a 1px stroke using the `outline-variant` token at **10% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
Buttons are the only elements allowed to break the tonal dark-on-dark theme.
*   **Primary:** Background: Pure White (#FFFFFF), Text: Black (#000000). Corners: `0.25rem`. 
*   **Secondary:** Background: `surface-container-highest` (#25252b), Text: White. Corners: `0.25rem`.
*   **States:** On hover, the Primary button should shift to `primary-dim` (#b8b9b9). No transitions—shifts should be instant and "mechanical."

### Repo Cards & Lists
*   **Structure:** No dividers. Use a `1.4rem` (spacing-4) vertical gap between list items.
*   **Interaction:** Upon hover, the card background shifts from `surface-container` to `surface-container-high`.
*   **No Avatars:** Use monograms or "Ghost" initials in `Label-SM` if an identity must be shown.

### Input Fields (Settings Only)
*   **Style:** No borders. Background: `surface-container-lowest`. 
*   **Focus State:** The background shifts to `surface-container-highest`. A 1px "Ghost Border" at 20% opacity may appear only during active focus.

### Status Indicators
Instead of vibrant circles, use small, sharp rectangles (`0.175rem` corners) using the `error` (#ec7c8a) or `primary` tokens to indicate build status.

---

## 6. Do's and Don'ts

### Do
*   **Embrace the Void:** Use `spacing-16` (5.5rem) or `spacing-20` (7rem) to separate major sections. The dashboard should feel like a spacious gallery, not a spreadsheet.
*   **Stay Sharp:** Keep all corner radii at `0.25rem` for buttons and a maximum of `0.5rem` for large containers. 
*   **Align to the Grid:** Every element must be snapped to a strict layout grid. Asymmetry should come from *where* you place content, not from "floating" it randomly.

### Don'ts
*   **No Rounded-Full:** Never use "pills" or circles. Even status indicators must be squared or slightly softened rectangles.
*   **No Search Bars:** This system assumes a curated view. Navigation is handled through structural hierarchy, not query inputs.
*   **No External Colors:** Do not introduce blues, greens, or yellows. Use the Zinc tonal scale. For errors, use the provided `error` (#ec7c8a) token only.
*   **No Dividers:** If you feel the need to draw a line, increase the `spacing` or change the `surface` tone instead.