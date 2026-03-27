-- Seed docs_agents table with all default Colony agents
-- Run via: wrangler d1 execute DB --local --file=migrations/core/seed_docs_agents.sql

INSERT OR IGNORE INTO docs_agents (id, name, description, tags, icon_name, icon_bg, icon_color, workshop_url, docs_slug, is_active, sort_order)
VALUES
  (
    'ux-design-agent',
    'UX Design Agent',
    'Takes a natural-language UX prompt and autonomously designs every page using Stitch, commits mockups to GitHub, and dispatches a Jules fleet to rebuild each page in Astro + Shadcn UI.',
    '["Jules","Stitch","Durable Object","SSE","GitHub"]',
    'Sparkles',
    'bg-indigo-500/10 border border-indigo-500/20',
    'text-indigo-400',
    '/workshop',
    'ux-design-agent',
    1,
    0
  ),
  (
    'jules-overseer',
    'Jules Overseer',
    'Monitors active Jules sessions via Durable Object alarms, detects CI failures by fetching Cloudflare build logs, and auto-remediates by prompting Jules with targeted fix instructions.',
    '["Jules","CI/CD","Durable Object","Cloudflare Builds"]',
    'Shield',
    'bg-amber-500/10 border border-amber-500/20',
    'text-amber-400',
    NULL,
    'jules-overseer',
    1,
    1
  ),
  (
    'workshop-agent',
    'Workshop Orchestrator',
    'The primary chat agent in the Agent Workshop. Decomposes project requirements into phased tasks and coordinates specialist agents to build complete Cloudflare Worker applications.',
    '["Honi","Cloudflare Agents","Chat","Planning"]',
    'Wrench',
    'bg-violet-500/10 border border-violet-500/20',
    'text-violet-400',
    '/workshop',
    'workshop-agent',
    1,
    2
  ),
  (
    'deep-research-agent',
    'Deep Research Agent',
    'Performs long-horizon research using Cloudflare Workflows, Vectorize RAG, and Sandbox containers. Clones repos, embeds code, and delivers daily HTML reports via email.',
    '["Workflows","Vectorize","Sandbox","Email"]',
    'BookOpen',
    'bg-cyan-500/10 border border-cyan-500/20',
    'text-cyan-400',
    NULL,
    'deep-research-agent',
    1,
    3
  ),
  (
    'planning-orchestrator',
    'Planning Orchestrator',
    'Breaks large engineering tasks into sub-tasks, assigns them to specialist agents, and tracks progress via a Kanban-style D1 schema with real-time frontend updates.',
    '["Multi-Agent","D1","Planning","Tasks"]',
    'Users',
    'bg-emerald-500/10 border border-emerald-500/20',
    'text-emerald-400',
    NULL,
    'planning-orchestrator',
    1,
    4
  ),
  (
    'github-standardization-agent',
    'Standardization Agent',
    'Audits GitHub repositories against configurable engineering standards, syncs MCP config and secrets, and logs violations to D1 for frontend review.',
    '["GitHub","MCP","Standards","Automation"]',
    'Code2',
    'bg-rose-500/10 border border-rose-500/20',
    'text-rose-400',
    NULL,
    'github-standardization-agent',
    1,
    5
  );
