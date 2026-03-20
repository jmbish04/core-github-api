/**
 * @file src/frontend/src/components/docs/UxDesignAgentDoc.tsx
 * @description Full documentation for the UX Design Agent.
 * Rendered at /docs/agents/ux-design-agent
 */
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles, GitBranch, Zap, Code2, Eye, Layers,
  CheckCircle2, ExternalLink, ArrowRight, BookOpen,
} from 'lucide-react';

// ─── Shared doc primitives ───────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Code({ children, lang = 'typescript' }: { children: string; lang?: string }) {
  return (
    <pre className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-x-auto text-[12px] text-zinc-300 font-mono leading-relaxed language-${lang}`}>
      <code>{children}</code>
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <ScrollArea className="w-full rounded-lg border border-zinc-800">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              {headers.map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-zinc-400 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-zinc-300">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScrollArea>
  );
}

function Note({ children, type = 'info' }: { children: React.ReactNode; type?: 'info' | 'warning' | 'tip' }) {
  const styles = {
    info: 'bg-blue-500/5 border-blue-500/20 text-blue-300',
    warning: 'bg-amber-500/5 border-amber-500/20 text-amber-300',
    tip: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-[12px] leading-relaxed my-3 ${styles[type]}`}>
      {children}
    </div>
  );
}

// ─── Main Doc Component ───────────────────────────────────────────────────────

export function UxDesignAgentDoc() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-0">

      {/* Hero */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">UX Design Agent</h1>
            <div className="flex gap-1.5 mt-1">
              {['Jules', 'Stitch', 'Durable Object', 'SSE', 'Honi', 'GitHub'].map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 py-0">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
          <CheckCircle2 className="w-4 h-4 inline-block mr-1 text-emerald-400" />
          Give the UX Design Agent a natural-language idea and it autonomously runs a 5-phase pipeline:
          it enhances your prompt with Jules, generates a page specification, designs each page in Stitch
          with an AI review loop, commits every mockup to GitHub, and dispatches a Jules fleet to rebuild
          each page in production-ready Astro + Shadcn UI with full backend hookups and tests.
        </p>
        <div className="flex gap-3 mt-4">
          <a href="/workshop" className="inline-flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            Open Workshop
          </a>
          <a href="/docs/agents" className="inline-flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:border-zinc-600 transition-colors">
            All Agents <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 1. Architecture Overview */}
      <Section title="Architecture Overview" icon={<Layers className="w-4.5 h-4.5 text-indigo-400" />}>
        <Code lang="mermaid">{`graph TD
    A["User: enters UX prompt + GitHub repo"] --> B["POST /api/ux/run"]
    B --> C["UxDesignAgent DO: startRun()"]

    C --> D["Phase 1: Enhance Prompt\\nJules repoless session\\n(enhance-prompt skill)"]
    D --> E["Phase 2: design-md\\nJules repoless session\\n(design-md skill)\\nOutputs: page list + prompts"]
    E --> F["Phase 3: Stitch Loop\\nFor each page:"]

    F --> G["StitchService.generateScreen()"]
    G --> H["AI Reviewer: evaluateStitchMockup()\\n→ score 0-10 + improvements"]
    H -- "score < 7, iteration < 3" --> I["StitchService.editScreen()"]
    I --> H
    H -- "score ≥ 7 OR iteration = 3" --> J["GitHubCommitService\\ncommit HTML + screenshot\\nStitchSessions/{id}/{page}/"]
    J --> K{more pages?}
    K -- "yes" --> F
    K -- "no" --> L["Phase 4: Jules Fleet\\n1 Jules session per page\\nconcurrency = 3"]

    L --> M["Jules rebuilds Astro/Shadcn page\\nfrom committed mockup"]

    subgraph SSE ["Real-time SSE Stream → /docs/agents/ux-design-agent frontend"]
      N["phase_start events"]
      O["page_update events"]
      P["stitch_preview events"]
      Q["jules_status events"]
      R["run_complete / run_error"]
    end

    C -.-> SSE
    D -.-> SSE
    E -.-> SSE
    H -.-> SSE
    J -.-> SSE
    M -.-> SSE`}</Code>

        <Note type="info">
          The UxDesignAgent is a <strong>Durable Object</strong> — all state survives Worker restarts between phases.
          The SSE stream is proxied from the DO directly to the browser, meaning you see live updates without polling.
        </Note>
      </Section>

      {/* 2. Agentic Setup */}
      <Section title="Agentic Setup" icon={<Code2 className="w-4.5 h-4.5 text-violet-400" />}>
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          The agent is built on three runtimes that each serve a distinct role:
        </p>

        <Table
          headers={['Layer', 'Technology', 'Role']}
          rows={[
            ['Agent Runtime', 'Honi (honidev)', 'createAgent<Env>() bootstraps the Durable Object, wires the model, and exposes the fetch handler'],
            ['State', 'Cloudflare Agents SDK (AgentStateStore)', 'Persists pipeline run state in DO SQLite across phases and Worker restarts'],
            ['Phase 1-2 Automation', 'Jules SDK — repoless mode', 'Runs ephemeral Jules sessions (no GitHub repo) to enhance the prompt and generate design-md page specs'],
            ['Page Design', 'Stitch SDK (StitchService)', 'Generates and iteratively edits Stitch UI screens using AI. Fetches HTML + screenshot URLs'],
            ['Design Review', 'Gemini 2.5 Flash (via runAgentText)', 'Reviews each Stitch mockup and returns a 0-10 score + improvement list'],
            ['GitHub Commits', 'GitHubCommitService (Octokit)', 'Commits Stitch HTML and screenshot PNG to the repo under StitchSessions/{id}/{page}/'],
            ['Phase 4 Fleet', 'Jules SDK — repo sessions', 'One Jules session per page, concurrency=3, each rebuilding the committed mockup in Astro/Shadcn'],
            ['Real-time Updates', 'SSE (Durable Object broadcast)', 'All connected browser tabs receive structured pipeline events via text/event-stream'],
          ]}
        />

        <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Skills Used</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'enhance-prompt', source: 'google-labs-code/stitch-skills', desc: 'Restructures raw UX ideas into a formal brief with personas, page list, and design principles' },
            { name: 'design-md', source: 'google-labs-code/stitch-skills', desc: 'Produces a YAML page specification listing every top-level page with a Stitch-ready prompt' },
            { name: 'workers-best-practices', source: 'local', desc: 'Ensures Jules-built pages use Cloudflare-idiomatic Hono routes and Durable Object patterns' },
            { name: 'react-best-practices', source: 'local', desc: 'Ensures Jules builds clean Shadcn React components with correct data fetching patterns' },
          ].map((skill) => (
            <div key={skill.name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs">
              <div className="font-mono text-indigo-300 font-medium">{skill.name}</div>
              <div className="text-zinc-500 text-[10px]">{skill.source}</div>
              <div className="text-zinc-400 mt-1">{skill.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Jules Repoless Mode */}
      <Section title="Jules Repoless Mode (Phases 1 & 2)" icon={<GitBranch className="w-4.5 h-4.5 text-blue-400" />}>
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          Jules "repoless" sessions run as ephemeral cloud functions — no GitHub repository is connected.
          They are ideal for pure generation tasks where the output is text content, not a code PR.
          The agent uses two repoless sessions before touching Stitch or GitHub:
        </p>

        <h3 className="text-sm font-semibold text-zinc-200 mt-4 mb-2">Phase 1: Prompt Enhancement</h3>
        <Code>{`// In UxDesignAgent.ts — phase1EnhancePrompt()
const session = await julesService.startRepolessSession({
  prompt: ENHANCE_PROMPT_TEMPLATE,  // Instructs Jules to produce enhanced-prompt.md
  metadata: { type: 'enhance_prompt', runId: this.store.state.runId },
});

// Wait for completion + extract the generated file
const result = await julesService.waitForCompletion(session.sessionId, {
  timeoutMs: 120_000,
});

// Jules repoless output lands in generatedFiles
const enhancedPrompt = result.generatedFiles?.['enhanced-prompt.md']
  ?? result.finalOutput;`}</Code>

        <Note type="tip">
          <code>generatedFiles</code> is a <code>Map&lt;filename, content&gt;</code> returned after a repoless session completes.
          The prompt instructs Jules to write its output to a specific filename (e.g. <code>enhanced-prompt.md</code>) so it can be retrieved deterministically.
        </Note>

        <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Phase 2: design-md Page Specification</h3>
        <p className="text-[12px] text-zinc-500 mb-3">
          The enhanced prompt is fed into a second repoless session that generates <code>design.md</code> — a YAML-like page spec the Stitch loop consumes:
        </p>
        <Code lang="yaml">{`pages:
  - name: overview
    title: Overview Dashboard
    prompt: "Design a dark-theme SaaS analytics dashboard with a KPI row of 4 metrics,
             a full-width line chart below, and a right sidebar with recent events.
             Use indigo accent colors. Mobile responsive."
  - name: logs
    title: Logs Explorer
    prompt: "Design a log viewer with a filter bar at the top (severity, time range,
             service), a virtualized log list below with colored severity badges,
             and an expandable detail panel on the right. Dark theme."
  - name: settings
    title: Settings
    prompt: "Design a settings page with a left category nav and a content area.
             Include toggle switches, text inputs, and a Save Changes button."`}</Code>
        <p className="text-[12px] text-zinc-500 mt-2">
          The <code>parseDesignMd()</code> method in the DO reads this output and creates one <code>PageState</code> entry per page, which drives the Stitch loop.
        </p>
      </Section>

      {/* 4. Jules Repo Swarm */}
      <Section title="Jules Fleet: Repo Session Swarm (Phase 4)" icon={<Zap className="w-4.5 h-4.5 text-amber-400" />}>
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          After all pages are committed to GitHub, the agent dispatches one Jules repo session per page.
          Sessions run at <strong>concurrency=3</strong> so a 9-page app completes in ~3 parallel waves.
        </p>

        <h3 className="text-sm font-semibold text-zinc-200 mt-4 mb-2">Concurrency Pattern</h3>
        <Code>{`// In UxDesignAgent.ts — phase4JulesFleet()
const CONCURRENCY = 3;
const queue = [...pages];
const active: Promise<void>[] = [];

while (queue.length > 0 || active.length > 0) {
  // Fill up to concurrency limit
  while (active.length < CONCURRENCY && queue.length > 0) {
    const page = queue.shift()!;
    active.push(processPage(page));  // starts Jules session
  }
  // Wait for any one to finish before scheduling next
  await Promise.race(active);
}`}</Code>

        <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Jules Prompt Structure (Per Page)</h3>
        <p className="text-[12px] text-zinc-500 mb-3">
          Each Jules session receives a highly structured prompt ensuring a consistent, production-quality output:
        </p>
        <Code>{`# Task: Rebuild "Overview Dashboard" Page in Astro + Shadcn UI

## Context
Rebuild the mockup committed at:
- HTML: StitchSessions/{stitchId}/overview/page.html  (ref on main branch)
- Screenshot: StitchSessions/{stitchId}/overview/screenshot.png

## 1. Astro Page (src/frontend/src/pages/overview.astro)
Create the Astro entry. Import the React island:
  <OverviewPage client:load />

## 2. React Component — Shadcn Substitution Rules (CRITICAL)
Every Stitch/HTML element → Shadcn equivalent:

  <button>     →  <Button>        from @/components/ui/button
  <input>      →  <Input>         from @/components/ui/input
  <select>     →  <Select>        from @/components/ui/select
  <textarea>   →  <Textarea>      from @/components/ui/textarea
  <table>      →  <Table>         from @/components/ui/table
  card divs    →  <Card>          from @/components/ui/card
  modal/popup  →  <Dialog>        from @/components/ui/dialog
  tab bars     →  <Tabs>          from @/components/ui/tabs
  status tags  →  <Badge>         from @/components/ui/badge

## 3. Sidebar Nav Update
Add link to /overview in the main sidebar nav component.
Icon: LayoutDashboard from lucide-react.

## 4. Backend Route
Create src/backend/src/routes/api/overview/index.ts:
  GET /api/overview → { kpis, recentEvents }
Register in main Hono router.

## 5. API Hookup
In the React component, fetch /api/overview on mount.
Use <Skeleton> while loading, <Alert> on error.

## 6. Smoke Test
Test that GET /api/overview returns HTTP 200 with a JSON body.

## 7. PR
Create a PR: "feat(ux): Add Overview Dashboard page [ux-run-{runId}]"`}</Code>

        <Note type="warning">
          The phrase <strong>"rebuild from scratch"</strong> is intentional. Jules is not asked to adapt the Stitch HTML —
          it reads it as a visual reference and constructs the page using Shadcn and Astro from the ground up.
          This ensures clean, type-safe code rather than patched HTML.
        </Note>
      </Section>

      {/* 5. Durable Object */}
      <Section title="Durable Object: UxDesignAgent" icon={<Eye className="w-4.5 h-4.5 text-cyan-400" />}>
        <p className="text-sm text-zinc-400 mb-4">
          The entire pipeline lives inside a single Durable Object instance per run.
          This means the pipeline state is durable across Worker restarts and the SSE stream can be paused/resumed.
        </p>

        <h3 className="text-sm font-semibold text-zinc-200 mb-2">State Machine</h3>
        <Code lang="text">{`idle → enhancing → designing → stitch_loop → building → done
                                                           ↘ error (at any phase)`}</Code>

        <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Key DO Patterns</h3>
        <Table
          headers={['Pattern', 'Where Used', 'Purpose']}
          rows={[
            ['AgentStateStore', 'All phases', 'Persists UxRunState to DO SQLite — survives Worker evictions'],
            ['setTimeout(..., 0)', 'startRun()', 'Returns HTTP 201 immediately while the pipeline continues async in the DO'],
            ['session.waitFor(\'AWAITING_PLAN_APPROVAL\')', 'Phase 1 & 2', 'Jules Overseer integration — auto-approves Jules plans so repoless sessions don\'t stall'],
            ['evaluateStitchMockup()', 'Phase 3 loop', 'LLM reviewer scoring 0-10 triggers up to 3 Stitch edit iterations before accepting'],
            ['broadcast(event)', 'Every state transition', 'Pushes JSON events to all connected SSE subscribers (browser tabs)'],
            ['Promise.race(active)', 'Phase 4 fleet', 'Controlled concurrency — max 3 Jules sessions in flight simultaneously'],
          ]}
        />

        <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">SSE Event Types</h3>
        <Table
          headers={['Event Type', 'Payload', 'Frontend Effect']}
          rows={[
            ['phase_start', '{ phase }', 'Advances the phase stepper, updates status badge'],
            ['pages_discovered', '{ pages[] }', 'Populates the page grid with one card per discovered page'],
            ['page_update', '{ pageName, status, iteration? }', 'Updates individual page card status badge and iteration counter'],
            ['stitch_preview', '{ pageName, screenshotUrl, htmlPath, score, iterations }', 'Loads thumbnail in page card, shows review score badge'],
            ['jules_status', '{ phase, sessionId, status, pageName? }', 'Links Jules session ID to page card, shows "View in Jules" link'],
            ['run_complete', '{ runId }', 'Marks all phases done, shows completion banner'],
            ['run_error', '{ error }', 'Shows error in phase tracker, stops the live feed spinner'],
          ]}
        />
      </Section>

      {/* 6. Hono Routes */}
      <Section title="API Routes" icon={<Code2 className="w-4.5 h-4.5 text-emerald-400" />}>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['POST', '/api/ux/run', 'Start a new UX design run. Body: { prompt, repoOwner, repoName }. Returns: { runId }. Creates D1 record and forwards to DO.'],
            ['GET', '/api/ux/run/:runId', 'Returns full run state from D1 including all page statuses, Jules session IDs, and commit SHAs.'],
            ['GET', '/api/ux/run/:runId/stream', 'SSE event stream. Proxies the Durable Object\'s broadcast channel. Connect once; receive events for the run lifetime.'],
            ['GET', '/api/ux/runs', 'Lists all UX design runs (most recent first, limit 50).'],
            ['DELETE', '/api/ux/run/:runId', 'Marks a run as cancelled in D1 (best-effort — cannot interrupt the DO mid-phase).'],
          ]}
        />

        <Note type="tip">
          Test the SSE stream independently:{' '}
          <code className="text-emerald-300">curl -N https://your-worker.dev/api/ux/run/&#123;runId&#125;/stream</code>
        </Note>
      </Section>

      {/* 7. How to Use */}
      <Section title="How to Use (Frontend)" icon={<BookOpen className="w-4.5 h-4.5 text-zinc-400" />}>
        <ol className="space-y-4 text-sm text-zinc-400 list-none">
          {[
            {
              step: '1',
              label: 'Open the Workshop',
              detail: 'Navigate to /workshop. If you have an active project, click the UX Workshop tab in the sidebar.',
              link: { href: '/workshop', label: 'Open Workshop' },
            },
            {
              step: '2',
              label: 'Enter your UX Prompt',
              detail: 'Describe the product and pages you want in the Launch Panel. Be specific about pages, purpose, and visual style.',
            },
            {
              step: '3',
              label: 'Set the GitHub Repo',
              detail: 'Enter the owner and repo name where Stitch mockups will be committed. The repo must be accessible via your GITHUB_TOKEN secret.',
            },
            {
              step: '4',
              label: 'Click Run UX Pipeline',
              detail: 'The Phase Tracker will start animating. Phase 1 → 2 → 3 → 4 runs automatically. You can close the tab and reopen — the SSE stream reconnects.',
            },
            {
              step: '5',
              label: 'Review mockups in real-time',
              detail: 'As Phase 3 completes pages, thumbnails appear in the Page Grid. Click any card to open a side-by-side HTML preview and screenshot.',
            },
            {
              step: '6',
              label: 'Review Jules PRs',
              detail: 'After Phase 4, each page card shows a PR link. Review and merge the PRs — your Astro/Shadcn pages are live.',
            },
          ].map((item) => (
            <li key={item.step} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-zinc-300 shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="font-medium text-zinc-200 mb-0.5">{item.label}</p>
                <p className="text-[12px] leading-relaxed">{item.detail}</p>
                {item.link && (
                  <a href={item.link.href} className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 mt-1">
                    {item.link.label} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>

        <h3 className="text-sm font-semibold text-zinc-200 mt-8 mb-3">Required Secrets</h3>
        <Table
          headers={['Secret', 'Used By', 'How to Set']}
          rows={[
            ['GITHUB_TOKEN', 'GitHubCommitService (commit Stitch files), Jules sessions (repo access)', 'wrangler secret put GITHUB_TOKEN'],
            ['STITCH_API_KEY', 'StitchService (generate/edit Stitch screens)', 'wrangler secret put STITCH_API_KEY'],
            ['JULES_API_KEY', 'JulesService (repoless sessions, fleet sessions)', 'wrangler secret put JULES_API_KEY'],
          ]}
        />
      </Section>
    </div>
  );
}
