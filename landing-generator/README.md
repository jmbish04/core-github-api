# 🎨 Worker Landing Page Generator

**Automatically generate cinematic landing pages for Cloudflare Workers.**

Analyzes your Worker's architecture, APIs, and features to create a stunning, marketing-quality landing page inspired by modern SaaS microsites—complete with gradient heroes, scroll animations, and narrative-driven copy.

---

## 🎯 What It Does

Transform this:
```json
// wrangler.jsonc
{
  "durable_objects": { ... },
  "d1_databases": [ ... ],
  "ai": { "binding": "AI" }
}
```

Into **this**: A fully responsive, animated landing page with:
- 🌊 Gradient hero with live stats
- 📊 Architecture diagrams
- ✨ Scroll-triggered animations
- 🎨 8 narrative sections (Problem → Solution → Features → Roadmap → CTA)
- 📱 Mobile-first Tailwind design
- 🧠 AI-powered content generation

---

## 🚀 Quick Start

### Generate a Landing Page

```bash
# Option 1: Use the TypeScript generator (requires tsx)
npx tsx landing-generator/generate.ts

# Option 2: Use the programmatic API
import { generateLandingPage } from './landing-generator';

const html = await generateLandingPage({
  wranglerConfig: require('./wrangler.jsonc'),
  packageJson: require('./package.json'),
  customAnalysis: {
    purpose: {
      headline: 'Your Killer Headline',
      tagline: 'What makes this Worker special',
      valueStatement: '2-3 sentences explaining impact'
    }
  }
});

fs.writeFileSync('public/index.html', html);
```

Output: `public/index.html` ready to deploy!

---

## 📁 Architecture

```
landing-generator/
├── analyzer.ts       # Extracts features from Worker config
├── blueprint.ts      # Transforms analysis into content structure
├── template.ts       # Generates HTML with Tailwind + animations
├── types.ts          # TypeScript interfaces
├── index.ts          # Main API
├── generate.ts       # CLI script for this Worker
└── README.md         # This file
```

### Data Flow

```
wrangler.jsonc + package.json
         ↓
    [Analyzer]  ← Extracts: DOs, D1, AI, KV, Queues
         ↓
  [Blueprint]   ← Generates: 8 sections of content
         ↓
   [Template]   ← Renders: HTML with Tailwind + Alpine.js
         ↓
   index.html   ← Deploy to Worker static assets
```

---

## 🎨 Design Philosophy

Inspired by **modern SaaS microsites** (Vibe Engineer, Linear, Vercel):

1. **Gradient Hero** - Bold headline + live stats + dual CTAs
2. **Problem Section** - 3-4 pain point cards
3. **Solution Section** - Architecture diagram + component breakdown
4. **Features** - Grid of capability cards with tech tags
5. **Metrics** - Quantitative impact (response time, uptime, scale)
6. **Use Cases** - Real-world persona scenarios
7. **Roadmap** - Timeline with v1/v2/v3 milestones
8. **CTA** - Gradient footer with final push to action

**Tone**: "Apple keynote meets Cloudflare docs" — confident, technical, inspiring.

---

## 🧱 Content Blueprint

The `BlueprintGenerator` creates narrative-driven content:

### Auto-Generated Sections

| Section | Source | Output |
|---------|--------|--------|
| **Hero** | `package.json` description | Headline, tagline, stats bar |
| **Problem** | Inferred from features | Pain point cards |
| **Solution** | `wrangler.jsonc` bindings | ASCII architecture diagram |
| **Features** | Durable Objects, AI, Queues | Capability cards with icons |
| **Metrics** | Component count + defaults | Response time, uptime, scale |
| **Use Cases** | Architecture patterns | Persona-based scenarios |
| **Roadmap** | Generic template | v1 (done) → v2 (progress) → v3 (planned) |

### Customization

Override any section with `customAnalysis`:

```typescript
const html = await generateLandingPage({
  wranglerConfig,
  packageJson,
  customAnalysis: {
    purpose: {
      headline: 'GitHub Automation Redefines How AI Agents Code',
      tagline: 'Multi-protocol GitHub proxy for autonomous operations',
      valueStatement: 'Transform GitHub into programmable infrastructure...'
    },
    metrics: [
      { value: '<50ms', label: 'P95 Latency', trend: 'positive' },
      { value: '99.99%', label: 'Uptime', trend: 'positive' }
    ],
    painPoints: [
      {
        title: 'AI Agents Lack GitHub Access',
        description: '...',
        solution: 'Native MCP Protocol with 7+ tools'
      }
    ]
  }
});
```

---

## 🎭 Style System

### Color Palette

- **Primary**: Indigo (`#4f46e5`) - Tech, professional
- **Secondary**: Emerald (`#10b981`) - Success, growth
- **Neutral**: Slate/Stone - Typography, backgrounds

### Animations

1. **Scroll Triggers** - Fade-in-up on viewport intersection
2. **Float** - Gentle vertical motion on architecture diagrams
3. **Pulse Glow** - Breathing shadow on primary CTA
4. **Gradient Flows** - Hero and CTA sections

### Typography

- **Font**: Inter (Google Fonts CDN)
- **Hierarchy**: 7xl hero → 5xl sections → 2xl cards → base body

---

## 🔧 API Reference

### `generateLandingPage(config)`

Main entry point for HTML generation.

```typescript
interface GeneratorConfig {
  wranglerConfig?: any;          // Parsed wrangler.jsonc
  packageJson?: any;              // Parsed package.json
  sourceFiles?: Record<string, string>; // Optional source code
  apiSpec?: any;                  // Optional OpenAPI spec
  customAnalysis?: Partial<WorkerAnalysis>; // Override defaults
}

Returns: Promise<string> // Full HTML document
```

### `WorkerAnalyzer.analyzeWorker(config)`

Extracts architecture components and features.

**Returns**:
- `components[]` - Durable Objects, D1, KV, Queues, AI
- `features[]` - API capabilities
- `endpoints[]` - HTTP routes
- `techStack[]` - Dependencies (Hono, Zod, etc.)

### `BlueprintGenerator.generate(analysis)`

Transforms analysis into 8-section content structure.

**Returns**: `ContentBlueprint` with hero, problem, solution, features, etc.

### `TemplateGenerator.generate(blueprint, name)`

Renders HTML with Tailwind CSS and Alpine.js.

**Features**:
- Glass morphism nav
- IntersectionObserver animations
- Responsive grid layouts
- Semantic HTML5 sections

---

## 📦 Deployment

### Static Assets (Recommended)

Add to your Worker:

```typescript
// src/index.ts
import landingPage from '../public/index.html';

app.get('/', (c) => c.html(landingPage));
```

Update `wrangler.jsonc`:
```jsonc
{
  "assets": { "directory": "./public" }
}
```

### Pages Deployment

```bash
npx wrangler pages deploy public
```

### Workers Sites

```bash
wrangler publish
```

---

## 🧪 Example Output

**For this Worker (Core GitHub API):**

✅ Generated `public/index.html` with:
- 8 full sections (Hero → CTA)
- Architecture diagram showing: Worker → 3 DOs → D1/AI/Queues
- 6 feature cards (Multi-Protocol, AI Intelligence, Real-Time, etc.)
- 3 use case scenarios (AI Agents, DevOps, Teams)
- 3-phase roadmap (v1 complete → v2 in progress → v3 planned)
- Responsive navigation with mobile menu
- Scroll animations on all sections

**View**: Open `public/index.html` in browser or deploy to Worker domain!

---

## 🎨 Customization Guide

### Change Color Scheme

Edit `template.ts`:
```typescript
.gradient-hero {
  background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
}
```

### Add New Section

1. Define in `types.ts`: `export interface MySection { ... }`
2. Add to `ContentBlueprint`: `mySection: MySection`
3. Generate in `blueprint.ts`: `generateMySection(analysis)`
4. Render in `template.ts`: `generateMySection(blueprint.mySection)`

### Custom Icons

Replace emoji icons in `blueprint.ts`:
```typescript
private static selectFeatureIcon(solution: string): string {
  return solution.includes('AI') ? '🤖' : '✨';
}
```

---

## 🚀 Future Enhancements

- [ ] Live metrics from `/metrics` endpoint
- [ ] Auto-extract features from OpenAPI spec
- [ ] Generate diagrams from D1 schema
- [ ] Dark mode toggle
- [ ] Interactive API playground embed
- [ ] Video/screenshot gallery section
- [ ] Customer testimonials from GitHub issues
- [ ] Internationalization (i18n)

---

## 📚 Inspiration

- **Vibe Engineer** - Gradient heroes, narrative sections
- **Linear.app** - Clean typography, scroll animations
- **Vercel.com** - Architecture diagrams, feature grids
- **Cloudflare Docs** - Technical accuracy + visual polish

---

## 📄 License

MIT - Use freely for your Workers!

---

## 🤝 Contributing

Found a bug or have ideas?
This generator is part of the **Core GitHub API** Worker project.

**Improvements welcome**:
- Better AI-powered content generation
- More sophisticated architecture diagram rendering
- Video embedding support
- Advanced analytics integration

---

**Built with ❤️ on Cloudflare Workers**
