# DESIGN.md — gh_research_feature (Monolith profile)

**Profile:** Monolith
**Theme mode:** DARK
**Font:** Inter (system fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)
**Stitch designTheme:** `DARK / INTER / ROUND_EIGHT / #ffffff / saturation 1`

This file is the verbatim source of truth for every screen Stitch generates for this feature and for every React rebuild Jules produces. The Section 6 design-theme block is non-negotiable.

---

## 1. Identity

The system is a **research librarian** — quiet, methodical, transparent. The UX evokes the feeling of watching an expert work, with their card catalog, their margin notes, their stack of pulled books. Every output is auditable. Nothing happens silently.

**Voice:** precise, neutral, slightly clinical. No emoji. No exclamation points. Sentences end with periods.

**Anti-tone:** "Hey! 🎉 Welcome to your dashboard! Let's get started!" — banned.

---

## 2. Color palette (OKLCH, dark default)

| Token | OKLCH | Hex (approx) | Use |
|---|---|---|---|
| `--background` | oklch(0.13 0 0) | `#0a0a0b` | App background |
| `--foreground` | oklch(0.98 0 0) | `#fafafa` | Primary text |
| `--card` | oklch(0.16 0 0) | `#101012` | Card / panel surfaces |
| `--card-foreground` | oklch(0.98 0 0) | `#fafafa` | Text on cards |
| `--muted` | oklch(0.20 0 0) | `#161618` | Subtle backgrounds (timeline rails, inactive tabs) |
| `--muted-foreground` | oklch(0.70 0 0) | `#a3a3a8` | Secondary text |
| `--border` | oklch(0.25 0 0) | `#3a3a3f` | Used ONLY for `ring-1 ring-border/40` or `divide-y divide-border/40`; never as a 1px border element |
| `--ring` | oklch(0.55 0.18 264) | `#5a6bff` | Focus ring + accent dividers |
| `--accent` | oklch(0.55 0.18 264) | `#5a6bff` | Primary actions, links, active states |
| `--accent-foreground` | oklch(0.98 0 0) | `#fafafa` | Text on accent fills |
| `--destructive` | oklch(0.55 0.22 27) | `#dc2c2c` | Destructive actions, errors |
| `--destructive-foreground` | oklch(0.98 0 0) | `#fafafa` | Text on destructive |
| `--success` | oklch(0.62 0.18 145) | `#22a866` | Pass / fit / success |
| `--warning` | oklch(0.78 0.18 85) | `#e0b54a` | Warn / partial |

### Chart palette (OKLCH overrides for `<ChartContainer>`)

```css
--chart-1: oklch(0.62 0.20 264);
--chart-2: oklch(0.62 0.20 145);
--chart-3: oklch(0.78 0.18 85);
--chart-4: oklch(0.62 0.20 27);
--chart-5: oklch(0.62 0.20 320);
```

Axes ticks and labels: force `tick={{ fill: 'hsl(var(--foreground))' }}` and `[&_.recharts-pie-label-text]:fill-foreground`.

---

## 3. Typography

| Token | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `text-xs` | 12px | 500 | 0.025em | Metadata, timestamps, tag chips |
| `text-sm` | 14px | 500 | 0.01em | Body, table cells |
| `text-base` | 16px | 500 | 0 | Default text |
| `text-lg` | 18px | 600 | -0.005em | Section labels |
| `text-xl` | 20px | 600 | -0.010em | Card titles |
| `text-2xl` | 24px | 700 | -0.015em | Page subtitles |
| `text-3xl` | 30px | 700 | -0.020em | Page titles |
| `text-4xl` | 36px | 800 | -0.025em | Hero headlines (sparingly) |

**Code:** JetBrains Mono fallback to ui-monospace. `text-xs leading-relaxed`. Code blocks inside cards: `bg-muted ring-1 ring-border/40 rounded-md p-3`.

---

## 4. Spacing, radius, motion

- **Radius:** `rounded-md` (6px) default; `rounded-lg` (8px) for cards; `rounded-full` for chips/avatars. The Stitch designTheme is `ROUND_EIGHT` — 8px corner radius globally.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48. Page padding: `px-6 py-8` on desktop, `px-4 py-6` on mobile.
- **Motion:** every dynamic element has a perpetual micro-motion — subtle, never distracting. Live transcript events fade-in with `motion-safe:animate-in motion-safe:fade-in slide-in-from-bottom-1 duration-200`. Status indicators pulse at 2s cadence.
- **Hover:** `transition-colors duration-150` on every interactive element. `hover:bg-card` on cards, `hover:ring-ring/40` on tappable items.

---

## 5. Separation rules (CRITICAL)

This profile **forbids traditional 1px borders** for visual separation. There is exactly one exception: the navbar bottom-edge.

Permitted separation patterns:

1. **`ring-1 ring-border/40`** — for cards, panels, popovers. The ring sits *inside* the border-box so it doesn't shift layout.
2. **`divide-y divide-border/40`** — for vertical lists of homogeneous items.
3. **`bg-card`** vs **`bg-background`** — surface-based separation; cards sit on app background as raised surfaces.
4. **Spacing (gap, margin)** — primary separator between unrelated content.
5. **Sanctioned border:** `border-b border-border/40` on the global `<Navbar />` only. Nowhere else.

Banned: `border` on Cards, `border-r` on sidebars (use `bg-muted` for the sidebar surface instead), `border-b` between table rows (use `divide-y`).

---

## 6. Stitch design-theme block (verbatim)

> The Stitch generator MUST receive this block in every `apply_design_system` call:

```yaml
mode: DARK
font: INTER
radius: ROUND_EIGHT
brand_color: "#ffffff"
saturation: 1
notes: |
  Dark shadcn surface; no traditional borders; ring-1 + divide-y + bg-card only.
  OKLCH chart palette per DESIGN.md §2.
  Inter for UI; JetBrains Mono for code.
  Library/research feel: librarian, methodical, transparent. No emoji.
  Always navbar; always mobile-responsive with collapsible sidebar.
  Every data table is sortable + filterable.
```

---

## 7. Component patterns specific to this feature

### 7.1 Source card

A finding/source rendered as a card. Used in: live job viewer (right rail), library list, finding similar list.

```
┌─────────────────────────────────────────────┐
│ [fav]  cloudflare/agents-sdk-examples        │
│        repo · round 2 · 12 ms ago            │
│ ─────────────────────────────────────────── │  ← divide-y, NOT border
│ Pattern: agent skill loading via             │
│ `loadSkills()` decorator with peer-binding   │
│ awareness. Three example skills included.    │
│                                              │
│ [#agents-sdk] [#skills]  fitness: ◯ ● ◯      │
└─────────────────────────────────────────────┘
```

- Wrapper: `bg-card ring-1 ring-border/40 rounded-lg p-4 hover:ring-ring/40 transition-colors`
- Title: `text-base font-semibold text-foreground`
- Metadata row: `text-xs text-muted-foreground`
- Body: `text-sm text-foreground/90 leading-relaxed`
- Tags: shadcn `<Badge variant="secondary" />`
- Fitness thumbs: tri-state `<ToggleGroup>` (miss / partial / fit) with `--success / --warning / --muted` fills

### 7.2 Transcript event card

Used in: `<SessionTranscript>` inside the live job viewer.

```
┌──────────────────────────────────────────────┐
│ 16:42:03  agent.action · sandbox.grep        │
│ ─────────────────────────────────────────── │
│ ResearchAgent ran:                            │
│   rg -ln 'Durable Object' /workspace/sdk     │
│                                              │
│ Found 17 hits across 6 files. Top: src/do/   │
│ AgentSessionDO.ts (4 hits).                  │
└──────────────────────────────────────────────┘
```

- Timestamp: `text-xs font-mono text-muted-foreground tabular-nums`
- Event type chip: `text-xs uppercase tracking-wider` colored by category (`agent.thought` → muted, `agent.action` → accent, `agent.result` → success, `system.error` → destructive)
- Code: monospace, syntax-highlight via `react-syntax-highlighter` with the OKLCH palette
- New events animate in: `motion-safe:animate-in motion-safe:fade-in slide-in-from-bottom-1 duration-200`

### 7.3 Rounds timeline (left rail of live viewer)

Vertical timeline with collapsible nodes per research round.

- Active round: glowing accent dot, slight pulse animation
- Completed: filled accent dot
- Pending: hollow muted dot
- Each node title + duration + event count

### 7.4 Library facet sidebar

Left rail on `/research/gh` library tab.

- Categories (with color dots)
- Source type filter (github-repo / web-page / github-issue / github-pr)
- Fitness filter (fit / partial / miss / unrated)
- Date range (last 7 / 30 / 90 / all)
- Mode filter (on-demand / pre-planning / weekly)
- "Find similar to..." (paste url or finding id)

### 7.5 Replay scrubber

Bottom-fixed bar on `/research/gh/jobs/[id]/replay`.

- Playback controls: `<<` `>>` `play/pause` (shadcn Button + Lucide icons)
- Speed: 1× / 2× / 4× / 8× toggle
- Scrubber: shadcn `<Slider>` showing seq position
- Event count + time-elapsed display

### 7.6 Category chip

Small pill used wherever a category appears.

- `inline-flex items-center gap-1.5 rounded-full bg-card ring-1 ring-border/40 px-2.5 py-0.5 text-xs font-medium`
- Color dot: `h-2 w-2 rounded-full` using `category.color` from data
- Hover reveals X to remove (in editor contexts only)

### 7.7 Librarian-thinking indicator

Used during pre-LLM-response moments to convey "the agent is thinking."

- Three pulsing dots, slight stagger
- `text-xs text-muted-foreground` label like "Considering 47 sources..."
- Lives inside the transcript feed, not in a modal

---

## 8. Layout primitives

### Page shell

```tsx
<html class="dark">
  <body class="bg-background text-foreground antialiased">
    <Navbar />  {/* sole sanctioned border-b */}
    <div class="flex">
      <Sidebar collapsible />  {/* bg-muted; no border */}
      <main class="flex-1 px-6 py-8 mx-auto max-w-screen-2xl">
        {children}
        <ErrorLogger />  {/* global toaster */}
      </main>
    </div>
  </body>
</html>
```

### Page header

```
┌─────────────────────────────────────────────┐
│ Research Library                             │   ← text-3xl font-bold
│ Curated knowledge from your GitHub research  │   ← text-sm text-muted-foreground
│                                              │
│ [Search…]              [+ New Research]      │   ← shadcn Input + Button
└─────────────────────────────────────────────┘
```

### Two-column layout (live viewer)

- Left rail: timeline (240px fixed)
- Center: transcript stream (flex-1, max-w-3xl)
- Right rail: source cards (320px fixed)

Mobile: stacks vertically; timeline becomes a collapsible accordion at top.

---

## 9. Accessibility

- All interactive elements have `aria-label` if no visible text
- Focus ring: `--ring` on `:focus-visible`
- Color contrast: every foreground/background pair clears WCAG AA at minimum
- Screen-reader announces new transcript events via `aria-live="polite"`
- Replay controls are keyboard-accessible (Space=play/pause, ←/→=step)

---

## 10. Anti-patterns (banned)

- Gradients on cards (use solid `bg-card` only)
- Drop shadows for separation (use `ring-1`)
- Rounded-XL/2XL/3XL on anything except hero images
- Multiple competing accent colors per screen
- Toast notifications for every event (transcript IS the notification surface)
- Emoji in production UI strings
- "Loading..." or "Saving..." spinner-only states without context — always include what's being loaded
- Gray-on-gray text below 4.5:1 contrast
- Glass-morphism backdrop-blur on data surfaces
- Skeuomorphic UI metaphors (no fake book covers, no card-catalog drawer images)

The librarian metaphor lives in *behavior*, not in *imagery*. The interface is flat, dark, dense — the *content* is what evokes a library.
