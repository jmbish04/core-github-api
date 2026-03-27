# DESIGN.MD: The Monolith Editorial (Stitch SDK Baseline)

## 1. Creative North Star: "The Monolith"
An authoritative, high-end editorial experience treated like a physical installation of carved stone and obsidian glass. 
- **Anonymity as Premium:** Strictly NO user profiles, avatars, or "Hello, User" text.
- **Breathable Brutalism:** High-contrast typography with expansive white space.
- **Surface over Structure:** Boundaries are defined by light, shadow, and tonal shifts—never by lines.

---

## 2. Canvas & Viewport Standards
To ensure "Stitch" creates consistent, scrollable, and responsive mockups, all generation must target these logical resolutions:

### Mobile (iPhone 16 Standard)
- **Width:** 393px
- **Height:** 852px (Initial Viewport)
- **Behavior:** Single-column stack, `spacing-4` (1rem) side margins.

### Desktop (Standard Web)
- **Width:** 1440px
- **Height:** 1024px (Initial Viewport)
- **Behavior:** 12-column grid, fixed Sidebar (Width: `spacing-24`).

---

## 3. Colors: Tonal Architecture (Shadcn Dark Optimized)
Mirroring the Shadcn/Tailwind CSS variable structure for Astro/Cloudflare deployment.


| Role | HEX / Value | CSS Variable |
| :--- | :--- | :--- |
| **Background** | `#131315` | `--background` |
| **Foreground** | `#FFFFFF` | `--foreground` |
| **Surface Low** | `#1C1B1D` | `--muted` |
| **Surface High**| `#353437` | `--accent` |
| **Primary** | `#FFFFFF` | `--primary` |
| **Primary Text**| `#1A1C1C` | `--primary-foreground` |
| **Ghost Border**| `#474747` (15% Op) | `--border` |

### The "No-Line" Rule
**Strict Prohibition:** 1px solid borders are forbidden for sectioning major UI areas. 
- **Method:** Separate content via background shifts. Place a `muted` card on a `background` page. The 1% tonal shift defines the boundary.

---

## 4. Typography: The Editorial Voice (Inter Variable)
Use scale variance to remove the "Generic SaaS" feel.


| Role | Size | Tracking | Weight |
| :--- | :--- | :--- | :--- |
| **Hero (Display)** | 3.5rem | -0.04em | 700 (Bold) |
| **Header (Headline)**| 1.5rem | -0.02em | 600 (Semi-Bold) |
| **Data Label** | 0.75rem | +0.05em | 500 (Caps) |
| **Body** | 0.875rem | 0 | 400 (Regular) |

---

## 5. Components & SDK Rules

### Sidebar & Navigation
- **Desktop:** Persistent, fixed width. No profile identifiers. Top section: Minimalist logo or Text Header.
- **Mobile:** Hidden by default. Triggered by a minimalist 2-line hamburger (Top 100%, Bottom 60%). Slides in as `surface-low` overlay with `backdrop-blur-xl`.

### Buttons & Inputs
- **Primary:** Solid `#FFFFFF`. Radius: `0.375rem` (shadcn default).
- **Secondary:** Glass-morphic. `surface-high` with 40% opacity and a 15% opacity ghost border.
- **Inputs:** No borders. Use `surface-low` fill. Focus: Transition to `surface-high`.

### Data Visualization (Recharts)
- **Lines:** Use `Primary` (#FFFFFF) for main data.
- **Grid:** Hide Y-axis lines. X-axis base: `border` (10% opacity).
- **Tooltips:** `surface-high` background, `0.75rem` radius, No border.

---

## 6. Implementation Logic (Stitch SDK)
1. **Scrolling:** Always enable fluid height. The page must extend vertically beyond the initial viewport height (852px/1024px).
2. **Elevation:** Use **Ambient Depth**. For floating elements: `shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)]`. 
3. **Dividers:** Forbid `<hr />` or border-separators. Use `spacing-8` (2rem) of white space to separate list items.
4. **Mobile Responsiveness:** Transition all `display-lg` text to `display-sm` automatically on mobile views.

---

## 7. App Defaults
**Login Page:** All apps by default MUST feature a login page constructed using this exact default styling framework. Avoid using traditional outlined inputs or generic card styles, and instead follow the "No-Line" rule and Tonal Architecture defined above.
