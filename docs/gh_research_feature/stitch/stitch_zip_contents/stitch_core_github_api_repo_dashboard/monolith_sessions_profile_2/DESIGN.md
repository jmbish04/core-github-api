---
name: Monolith Sessions Profile
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c1c6d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8b919f'
  outline-variant: '#414754'
  surface-tint: '#abc7ff'
  primary: '#abc7ff'
  on-primary: '#002f65'
  primary-container: '#438fff'
  on-primary-container: '#002959'
  inverse-primary: '#005cbb'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#ffb688'
  on-tertiary: '#512400'
  tertiary-container: '#e2710a'
  on-tertiary-container: '#471e00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d7e3ff'
  primary-fixed-dim: '#abc7ff'
  on-primary-fixed: '#001b3f'
  on-primary-fixed-variant: '#00458f'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#ffdbc7'
  tertiary-fixed-dim: '#ffb688'
  on-tertiary-fixed: '#311300'
  on-tertiary-fixed-variant: '#733600'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-desktop: 32px
  margin-mobile: 16px
  container-max: 1440px
---

## Brand & Style
The design system is defined by a philosophy of **Methodical Density**. It is built for power users, researchers, and technical professionals who require high information density without visual clutter. The aesthetic draws from the "Librarian" archetype: organized, exhaustive, and precisely categorized.

The style is a synthesis of **Minimalism** and **Technical Professionalism**. It rejects decorative elements in favor of functional structure. The UI evokes a sense of archival stability, utilizing a strict grid and monospaced technical accents to signal accuracy and systemic depth. The atmosphere is quiet, dark, and intensely focused.

## Colors
The palette is monochromatic and functional, punctuated by a single high-chroma accent. 

- **Base Background:** `oklch(0.13 0 0)` serves as the foundation, providing a deep, non-distracting canvas.
- **Surface/Container:** `oklch(0.16 0 0)` is used for cards, sidebars, and nested layers to create subtle tonal separation.
- **Accent:** `oklch(0.55 0.18 264)` is reserved for primary actions, active states, and critical path highlights.
- **Borders/Dividers:** Separation is achieved through `rgba(255, 255, 255, 0.1)` rings rather than solid fills, maintaining a lightweight feel in high-density layouts.

## Typography
Typography is the primary tool for hierarchy. This design system utilizes a dual-font strategy:

1. **Inter:** Used for all standard UI elements, navigation, and body copy. It ensures legibility at small sizes within dense layouts.
2. **JetBrains Mono:** Used strictly for technical metadata, unique identifiers (IDs), timestamps, and status labels. This provides a clear visual distinction between human-readable content and system-generated data.

Text density is high. Line heights are kept tight (approx 1.4x-1.5x) to maximize the amount of information visible on a single screen without sacrificing vertical rhythm.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy for desktop, ensuring that information density remains predictable and manageable. 

- **Grid:** A 12-column grid system with 16px gutters. Elements should align strictly to this grid to maintain a methodical appearance.
- **Rhythm:** An 8px base unit governs all padding and margins. 
- **Density:** Padding within containers is minimized to prioritize content. Use 12px or 16px internal padding for cards.
- **Separation:** Traditional 1px borders are prohibited, with the exception of the global navigation bottom border. Separation between adjacent sections is achieved through `divide-y` (1px lines with 10% white opacity) or tonal shifts between the background and surface colors.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Rings** rather than shadows.

- **Level 0 (Background):** `oklch(0.13 0 0)` - The lowest surface.
- **Level 1 (Surface):** `oklch(0.16 0 0)` - Used for primary cards and main content areas. These surfaces must use a `ring-1` outline at `white/10` opacity to define their edges.
- **Level 2 (Popovers/Modals):** `oklch(0.19 0 0)` - Used for floating elements. These require a more prominent `ring-1` at `white/20`.

Avoid ambient shadows entirely. The interface should feel flat and architectural, like a physical archive drawer.

## Shapes
The shape language is disciplined and consistent. All interactive elements, containers, and cards utilize a standard **8px (0.5rem)** corner radius. 

Larger components like modals or main content wrappers should not exceed 8px. This consistency reinforces the methodical nature of the system. Interactive states (hover/active) should be represented by color shifts or ring intensity changes rather than shape transformations.

## Components

### Buttons
Buttons are utilitarian. Primary buttons use the accent color with white or high-contrast text. Secondary buttons use a `white/5` fill with a `white/10` ring. Text is always centered and set in Inter Bold.

### Cards & Surfaces
Every card must use the surface color and a 1px ring. For lists within cards, use `divide-y` with `white/10` opacity. Headers within cards should use the `label-caps` typography style in JetBrains Mono to denote section titles.

### Input Fields
Inputs are subtle. They use the background color for the fill and a `white/10` ring for the border. On focus, the ring transitions to the accent color. Placeholder text is low-contrast.

### Technical Metadata (Chips)
Metadata chips use JetBrains Mono. They are rectangular with an 8px radius, featuring a `white/5` background and no border. These are used for tags, IDs, and system statuses.

### Lists
Lists are dense. Row height is capped at 40px for standard items. Use `divide-y` to separate rows. Hover states on list items should use a subtle background shift to `white/5`.