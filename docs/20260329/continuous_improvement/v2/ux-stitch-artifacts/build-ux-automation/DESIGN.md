# Design System Document

## 1. Overview & Creative North Star: "The Monolith"
This design system is anchored in the concept of **"The Monolith"**—a high-end, editorial approach to technical interfaces perfectly mapped to the **Shadcn UI Default Dark Theme (Zinc)**. Moving beyond basic templates, we treat the UI as a singular, carved block of dark matter. It is a system built on high-contrast precision, where the absence of color is as important as the content itself.

By leveraging intentional asymmetry, extreme typographic scales, and a rejection of traditional structural lines, we create an experience that feels like a premium terminal for architects of code. We avoid "template" looks by prioritizing breathing room (negative space) and tonal depth over rigid grids, ensuring seamless 1:1 translation to Astro + React + Shadcn JSX.

---

## 2. Mockup & Layout Standards (MANDATORY ENFORCEMENT)
To ensure the AI agent and the developer stay perfectly synchronized during the translation from mockups to the Cloudflare Astro/React stack, the following dimension and responsive rules are strictly enforced:

- **Dual-Version Generation:** All generated mockups in this design system must be provided in two explicit versions: **Desktop** and **Mobile**. All pages must be natively responsive and mobile-friendly.
- **Strict Viewport Dimensions:**
  - **Desktop:** Exactly **1440x900 pixels**. (Do not use 1280x1601).
  - **Mobile:** Exactly **390x844 pixels**. (Do not use 632x1609).

---

## 3. Colors: Tonal Architecture
The palette is deeply rooted in Shadcn's default dark mode (Zinc), specifically anchored at `--background: oklch(0.145 0 0)`.

### Core Shadcn Variable Mapping (base-vega Dark Theme)
All mockups must visually represent these exact CSS variables from the project's `global.css` dark theme:
- **Background & Foreground:** `--background: oklch(0.145 0 0)`, `--foreground: oklch(0.985 0 0)`
- **Card & Popover:** `--card: oklch(0.205 0 0)`, `--popover: oklch(0.205 0 0)` (Elevated surface)
- **Muted & Secondary:** `--muted: oklch(0.269 0 0)`, `--secondary: oklch(0.269 0 0)` (Subtle surfaces)
- **Accent:** `--accent: oklch(0.371 0 0)` (Hover states, elevated interactions)
- **Primary:** `--primary: oklch(0.87 0 0)`, `--primary-foreground: oklch(0.205 0 0)` (High-contrast white)
- **Border & Input:** `--border: oklch(1 0 0 / 10%)`, `--input: oklch(1 0 0 / 15%)` (Translucent borders)
- **Surface:** `--surface: oklch(0.2 0 0)` (Secondary surface layer)
- **Selection:** `--selection: oklch(0.922 0 0)`, `--selection-foreground: oklch(0.205 0 0)`
- **Destructive:** `--destructive: oklch(0.704 0.191 22.216)` (Error red)
- **Radius:** `--radius: 0.625rem`

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for defining primary sections. Structural boundaries must be established through:
- **Tonal Shifts:** Transitioning from `background` to `muted` or `accent`.
- **Negative Space:** Using the Tailwind Spacing Scale (specifically `8` to `16`) to create mental dividers.
- **Surface Nesting:** Placing an `accent` element within a `background` base to denote hierarchy.

### The "Glass & Gradient" Rule
To elevate the aesthetic, use Glassmorphism for floating overlays (e.g., the Sidebar when toggled or Tooltips). Use the foreground color at 5% opacity with a `20px` backdrop-blur.
*Signature Polish:* Apply a subtle linear gradient to the Primary CTA to prevent the high-contrast white from appearing "flat" against the deep black.

---

## 4. Typography: Editorial Authority
We use **Inter** (the Shadcn default sans-serif) not just as a font, but as a typographic tool for hierarchy.

- **Display & Headlines:** Use `text-4xl` or `text-5xl` (`2.25rem`+) with `tracking-tighter` for page titles. This "tight" letter spacing creates a dense, authoritative block of text.
- **Body:** `text-base` (`1rem`) with `leading-7` ensures maximum readability against high-contrast backgrounds.
- **Labels & Muted:** Use `text-xs` (`0.75rem`) for metadata. These must use the `--muted-foreground` variable (`oklch(0.708 0 0)`) to recede into the background, leaving primary content to "pop."

---

## 5. Elevation & Depth: Tonal Layering
Traditional drop shadows are replaced by **Tonal Layering**, utilizing Shadcn's surface hierarchy.

- **The Layering Principle:** Depth is achieved by stacking. A card placed on a muted background creates a natural "recessed" effect.
- **Ambient Shadows:** For floating elements (popovers/dialogs), use a `48px` blur with `4%` opacity using the foreground color. This mimics natural ambient light.
- **The "Ghost Border" Fallback:** If a container requires a boundary for accessibility, use the `--border` variable at **10% opacity**. Never use a 100% opaque border.

---

## 6. Components: Precision Primitives

### Sidebar (The Utility Anchor)
Must map perfectly to the Shadcn UI `<Sidebar />` component (using `--sidebar-background`, `--sidebar-border`, etc.).
- **Structure:** `--sidebar-background` (`oklch(0.145 0 0)`).
- **Header:** Features a top-aligned hamburger toggle.
- **Footer:** Fixed section containing standard endpoints: `/openapi.json`, `/swagger`, `/scalar`, `/context`, `/docs`, and `/health`.
- **Constraint:** NO user profiles or avatars. The system is purely tool-centric.

### Top Header (The Status Bar)
- **Constraint:** No search bar.
- **Right-Side Stack:**
  - **Alert Bell:** High-contrast `primary` icon with a `destructive` (red) badge.
  - **Settings Cog:** Standard `muted-foreground`.
  - **System Health Badge:** A pill-shaped badge. Text reflects "Healthy" (green tint) or "Degraded" (amber tint).

### Buttons & Inputs
- **Primary Button:** `<Button />` uses `--primary` background with `--primary-foreground` text.
- **Input Fields:** `<Input />` fields have no traditional borders. Use an `accent` background with a `2px` bottom-bar that illuminates to `primary` on focus.
- **Cards:** `<Card />` components use the `card` background. Forbid divider lines; use `p-6` (24px padding) to separate content blocks.

### Data Visualization (Recharts)
Charts must strictly adhere to the project's built-in charting variables (blue/indigo spectrum optimized for dark backgrounds):
- **Chart-1:** `--chart-1: oklch(0.809 0.105 251.813)` (Light Blue)
- **Chart-2:** `--chart-2: oklch(0.623 0.214 259.815)` (Medium Blue)
- **Chart-3:** `--chart-3: oklch(0.546 0.245 262.881)` (Deep Blue)
- **Chart-4:** `--chart-4: oklch(0.488 0.243 264.376)` (Indigo)
- **Chart-5:** `--chart-5: oklch(0.424 0.199 265.638)` (Deep Indigo)

### Sidebar
The sidebar uses its own token set for tonal independence:
- **Sidebar Background:** `--sidebar: oklch(0.205 0 0)` (Elevated from page background)
- **Sidebar Primary:** `--sidebar-primary: oklch(0.488 0.243 264.376)` (Indigo accent)
- **Sidebar Accent:** `--sidebar-accent: oklch(0.269 0 0)` (Hover/active state)
- **Sidebar Border:** `--sidebar-border: oklch(1 0 0 / 10%)` (Translucent)

---

## 7. Do's and Don'ts

### Do:
- **Do** explicitly generate both Desktop (1440x900) and Mobile (390x844) mockups for every design request.
- **Do** use `tracking-tighter` on all H1 and H2 elements to maintain the editorial "Zinc" look.
- **Do** rely on Tailwind Spacing (`space-y-4`, `gap-4`, `p-6`) to create separation rather than drawing lines.
- **Do** use `backdrop-blur` on the sidebar to suggest the content continues beneath it.
- **Do** ensure every visual element maps 1:1 with Shadcn's default dark theme (Zinc).

### Don't:
- **Don't** generate mockups using arbitrary pixel dimensions.
- **Don't** ever use a profile image. This is a system-first interface, not a social one.
- **Don't** use standard blue for links. Use `--primary` (white) with an underline.
- **Don't** use high-opacity borders. They break the "Monolith" illusion.
- **Don't** place a search bar in the header; keep the navigation focused on the sidebar and status.
