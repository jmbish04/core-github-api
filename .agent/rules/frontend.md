# Frontend & UI Architecture Status

## 1. Moody Modern Architecture & Shadcn
- **Framework**: Astro (latest) + `@astrojs/react`.
- **Styling**: Tailwind CSS v4 (OKLCH). Default Dark Theme is mandatory (`<html class="dark">`). No light mode toggles unless requested.
- **UI Components**: Shadcn UI (Official) and Shadcn-compatible registries. Replace all raw HTML component mockups with Shadcn equivalents.

## 2. Astro Islands & Hydration
- **Hydration Rules**: All interactive React components must be wrapped as Astro islands (`client:load` or `client:visible`).
- **Routing**: Every page must have a dedicated `.astro` file in `src/pages/` for SSR. Unified monolithic Worker `wrangler.jsonc` platform proxy configuration is mandatory.

## 3. Responsive Design & Layouts
- **Mobile First**: Wrap content in `<div class="container overflow-x-hidden md:px-0 scroll-smooth">` inside the `Layout` template. Use generic Tailwind responsive breakpoints.
- **Header & Navigation**: Keep headers sticky and responsive with full-screen collapsible navigation overlays for mobile.

## 4. Stitch Design System Compliance
- **Directives**: Follow the `DESIGN.md` guidelines created by Stitch. Use the "Strict No-Line Rule" constraints (no 1px borders for containment if forbidden), remove redundant search boxes if unnecessary, and ensure the UI operates under a system-first context (minimal UI clutter).
