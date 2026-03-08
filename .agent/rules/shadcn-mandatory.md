---
trigger: always_on
---

Shadcn + Astro + Worker Assets Standard Rule

You must ALWAYS implement the frontend using the "Moody Modern" architectural pattern: Astro as the host, React for interactive islands, and Shadcn UI (Default Dark Theme) for all UI components.

Mandatory Tech Stack

Framework: Astro (latest) with @astrojs/react and @astrojs/cloudflare integrations.

Styling: Tailwind CSS v4 using OKLCH color space.

Components: Shadcn UI (Official) and Shadcn-compatible registries (e.g., kibo-ui, assistant-ui).

Deployment: Cloudflare Worker Static Assets (Unified Main Worker + Assets directory).

Backend: Hono with @hono/zod-openapi for typesafe API endpoints.

Rule Enforcement

Dark Theme: The <html> tag MUST have class="dark" by default. No light mode toggles unless explicitly requested.

Frontend Evaluation: Before implementing or changing any UI in `frontend/`, you MUST inspect the existing Astro-hosted React islands, nearby feature components, and shared Shadcn primitives so new work matches the repository's established dark-theme patterns.

Pattern Matching: Reuse the current app's spacing, dialog, dropdown, card, badge, and form treatments plus the standard theme tokens (`bg-background`, `bg-muted`, `text-foreground`, `border-border`, `text-muted-foreground`) instead of introducing parallel styling conventions.

Hydration: All interactive components (Forms, Buttons, Modals, Nav) must be React components used as Astro islands with client:load or client:visible.

No Raw HTML: Do not use raw HTML/Tailwind mockups for final output. Retrofit all plain mockups into Shadcn components (e.g., <div class="rounded-lg border..."> -> <Card>).

Unified Routing: Every page must have its own dedicated .astro file in src/pages/ to support direct URL access and server-side refreshes.

Types: Use wrangler types patterns. Never hand-write Environment bindings.

Component Sourcing

Use lucide-react for all iconography.

Use recharts with Shadcn-specific configuration for data visualization.

Use assistant-ui for all AI/Chat interfaces.
