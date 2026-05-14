---
name: Monolith Sessions Profile
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191c23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e0e2ec'
  on-surface-variant: '#c1c6d6'
  inverse-surface: '#e0e2ec'
  inverse-on-surface: '#2d3038'
  outline: '#8b909f'
  outline-variant: '#414754'
  surface-tint: '#adc7ff'
  primary: '#adc7ff'
  on-primary: '#002e68'
  primary-container: '#1a73e8'
  on-primary-container: '#ffffff'
  inverse-primary: '#005bc0'
  secondary: '#c8c6c5'
  on-secondary: '#303030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#ffb691'
  on-tertiary: '#552100'
  tertiary-container: '#c55500'
  on-tertiary-container: '#0e0200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc7ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1b1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb691'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#783100'
  background: oklch(0.13 0 0)
  on-background: '#e0e2ec'
  surface-variant: '#32353c'
  card: oklch(0.16 0 0)
  foreground: oklch(0.98 0 0)
  muted-foreground: oklch(0.6 0 0)
  accent: oklch(0.55 0.18 264)
  border: oklch(0.25 0 0)
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
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-base:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '450'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1440px
  sidebar-width: 240px
  gutter: 1rem
  margin-mobile: 1rem
  margin-desktop: 2rem
---

# Design System: Monolith (Sessions Control Panel)

## 1. Visual Foundation
- **Theme**: Dark mode only.
- **Color Palette (OKLCH)**:
  - Background: `oklch(0.13 0 0)`
  - Cards/Surfaces: `oklch(0.16 0 0)`
  - Foreground (Primary Text): `oklch(0.98 0 0)`
  - Muted Foreground: `oklch(0.6 0 0)`
  - Accent (Primary/Links): `oklch(0.55 0.18 264)`
  - Border/Ring: `oklch(0.25 0 0)`
- **Typography**:
  - UI Text: Inter (Sans-serif)
  - Code/UUIDs/Session IDs: JetBrains Mono (Monospace)
- **Geometry**:
  - Border Radius: 8px
  - Border Logic: No traditional 1px solid borders. Use `ring-1 ring-border/40` for card boundaries and `divide-y divide-border/40` for lists. Navbar bottom edge is the only allowed solid border.

## 2. Component Patterns
- **Session Cards**: `bg-card ring-1 ring-border/40 rounded-lg p-4 hover:ring-ring/40 transition-all`.
- **Badges**: Muted background chips with high-contrast text for session kinds (gh-research, jules, sprint, hitl-deliberation).
- **Navigation**: Collapsible sidebar on desktop, hamburger menu on mobile.
- **Tone**: Methodical, dense, sober. No emojis. No gradients. No drop shadows.
