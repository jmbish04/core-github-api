# Design System Specification: The Monolith Implementation
## 1. Overview & Creative North Star: "The Brutalist Sanctuary"
This design system rejects the "web-standard" clutter of borders and generic grids in favor of a high-end, editorial approach. The Creative North Star is **The Brutalist Sanctuary**: a digital environment that feels carved from a single block of obsidian (Zinc), where hierarchy is defined by light and shadow rather than lines.
By leveraging intentional asymmetry and radical "No-Line" architecture, we move away from "SaaS-generic" and toward an authoritative, premium interface. This system is designed for high-stakes environments where focus is paramount and distractions (like user profiles or search bars) are intentionally stripped away to reveal the raw utility of the data.
---
## 2. Colors & Surface Architecture
The palette is rooted in the Shadcn Zinc Dark aesthetic, utilizing OKLCH for superior perceptual uniformity.
### The "No-Line" Rule
**Strict Prohibition:** Designers are forbidden from using `1px` solid borders for sectioning or containment.
- **Structural Separation:** Use tonal shifts (e.g., a `surface-container-low` section sitting on a `surface` background).
- **Negative Space:** Use the Spacing Scale (specifically `8` [2rem] and `12` [3rem]) to create cognitive boundaries.
### Surface Hierarchy (Nesting)
Treat the UI as a physical stack of materials.
- **Base Layer:** `background` (#131315 / oklch(0.145 0 0)).
- **Primary Layout Blocks:** `surface-container-low` (#1c1b1d).
- **Interactive/Raised Elements:** `surface-container` (#201f22) or `surface-container-high` (#2a2a2c).
- **The "Glass" Rule:** For floating modals or dropdowns, use `surface-variant` at 80% opacity with a `backdrop-blur-xl` to ensure the "Monolith" feels deep and integrated rather than flat.
---
## 3. Typography: The Editorial Edge
We use **Inter** exclusively, but with an aggressive editorial treatment to convey authority.
- **Headlines (`headline-lg` to `display-lg`):** Must use `tracking-tighter` (-0.05em). The tight letter-spacing creates a "block" effect that mimics high-end print typography.
- **The Scale:**
- **Display-LG (3.5rem):** Reserved for hero metrics or impact statements.
- **Headline-SM (1.5rem):** Standard section headers.
- **Label-SM (0.6875rem):** Used for the fixed sidebar footer links and metadata.
- **Contrast:** Always use `primary` (Pure White) for headlines and `on-surface-variant` (Muted Zinc) for body text to guide the eye through the "No-Line" layout.
---
## 4. Elevation & Depth (Tonal Layering)
Without borders, depth is our only tool for organization.
- **The Layering Principle:** Place `surface-container-lowest` elements inside `surface-container` sections to create "wells" of data. Conversely, use `surface-bright` for hover states to "lift" an element toward the user.
- **Ambient Shadows:** Only use shadows on floating elements (Settings dropdowns, Alert menus). Use a `40px` blur at 10% opacity using the `surface-container-lowest` color.
- **The Ghost Border Fallback:** Only for high-density data tables where tonal shifts fail, use a 10% opacity `outline-variant` line. This should be invisible at a glance but functional upon focus.
---
## 5. Signature Components
### Header & Sidebar
- **The Monolith Header:** No search bar. The right-side stack is fixed:
1. **System Health Badge:** Pill shape, `surface-container-high` background. Text: "Healthy" (in `primary`) or "Degraded" (in `error`).
2. **Alert Bell:** `on-surface` icon with a `4px` `error` (Red) dot badge at the top right.
3. **Settings Cog:** Minimalist `on-surface` icon.
- **The Fixed Sidebar:**
- **Top:** Hamburger toggle (minimalist two-line icon).
- **Bottom:** A fixed vertical stack of text links in `label-sm`: `/openapi.json`, `/swagger`, `/scalar`, `/context`, `/docs`, `/health`.
- **NO PROFILES:** Avatars and user emails are strictly prohibited. The system is an anonymous utility.
### Inputs & Actions
- **Buttons:**
- **Primary:** Pure White (`primary`) background with Black (`on-primary`) text. High contrast, sharp `0.25rem` corners.
- **Secondary:** `surface-container-highest` background, no border.
- **Checkboxes/Radios:** Use `primary` for selected states. The high-contrast white-on-dark is the signature interaction.
- **Data Visualization:** Use Shadcn/Recharts OKLCH tokens. Avoid multi-color rainbows. Stick to a monochromatic Zinc scale with `primary` (White) as the accent "insight" color.
---
## 6. Do's and Don'ts
### Do:
- **Use negative space as a weapon.** If a section feels crowded, double the padding instead of adding a line.
- **Vary the surface levels.** A dashboard should feel like a topography of different Zinc depths.
- **Strictly adhere to dimensions.** 1440x900 for Desktop and 390x844 for Mobile.
### Don't:
- **Do not use "User" icons.** This is a system-first interface.
- **Do not use "Search" inputs.** The layout must be intuitive enough that search is unnecessary.
- **Do not use Rounded-Full.** Stick to the Roundedness scale (`lg` / `0.5rem` max) to maintain the architectural, "Brutalist" feel.
---
## 7. Mockup Technical Requirements
All generated screens must be produced in both formats:
1. **Desktop Canvas:** 1440px width x 900px height.
2. **Mobile Canvas:** 390px width x 844px height.
3. **Background:** Must be `oklch(0.145 0 0)` to ensure true Zinc Dark fidelity.