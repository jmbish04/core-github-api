/**
 * @file nav-config.ts
 * @description Single source of truth for the application's navigation structure.
 *
 * Both AppSidebar and the /sitemap page derive their contents from this file so
 * that the two views always stay in sync automatically.
 *
 * To add a new page or section:
 *   1. Add an entry here.
 *   2. AppSidebar will render it via the shared constants below.
 *   3. The /sitemap page will automatically include it.
 */

export interface NavItem {
  label: string;
  href: string;
  description?: string;
}

export interface NavSection {
  /** Section heading — matches the sidebar group labels */
  group: string;
  items: NavItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation groups — mirroring AppSidebar order exactly
// ─────────────────────────────────────────────────────────────────────────────

export const NAV_GLOBAL: NavItem[] = [
  { label: 'Home',              href: '/',          description: 'Welcome dashboard and overview' },
  { label: 'All Projects',      href: '/projects',  description: 'Browse and open repository workspaces' },
  { label: 'Projects (Kanban)', href: '/kanban',    description: 'Kanban board view across all active projects' },
  { label: 'Chat Assistant',    href: '/chat',      description: 'AI-powered chat assistant' },
  { label: 'Roadmap',           href: '/roadmap',   description: 'Project roadmap and milestones' },
  { label: 'ToDos',            href: '/todos',     description: 'Global to-do corkboard' },
  { label: 'Dashboard',         href: '/dashboard', description: 'Analytics and metrics dashboard' },
];

export const NAV_OPERATIONS: NavItem[] = [
  { label: 'Workflows',  href: '/workflows',  description: 'Cloudflare Workflows — background job monitoring' },
  { label: 'Webhooks',   href: '/webhooks',   description: 'Incoming GitHub webhook event log' },
];

export const NAV_TOOLBOX: NavItem[] = [
  { label: 'Reverse Engineering',  href: '/reverse-engineering',         description: 'Analyze a repository into PRD, epics, journeys, and UX evidence' },
  { label: 'PR Comment Extractor',  href: '/tools/pr-extractor',         description: 'Extract and analyze pull-request comments' },
  { label: 'Cloudflare Docs Agent', href: '/tools/cloudflare-docs',       description: 'AI agent for Cloudflare documentation Q&A' },
  { label: 'CF Docs Agent [Beta]',  href: '/tools/cloudflare-docs-beta',  description: 'Beta variant of the Cloudflare Docs Agent' },
  { label: 'PR Webhook Extractor',  href: '/tools/pr-webhook',            description: 'Inspect and replay PR webhook payloads' },
];

export const NAV_RESEARCH: NavItem[] = [
  { label: 'Custom Jobs',     href: '/research/custom',          description: 'Create and run custom deep-research jobs' },
  { label: 'Daily Trends',    href: '/research/daily-trends',    description: 'Automated daily GitHub trending-repo analysis' },
  { label: 'Configure Cron',  href: '/research/configure-cron',  description: 'Schedule and manage research cron jobs' },
];

export const NAV_SYSTEM: NavItem[] = [
  { label: 'System Health', href: '/health',           description: 'Live health checks and service status' },
  { label: 'Settings',      href: '/settings/general', description: 'Global application settings' },
  { label: 'Alerts',        href: '/alerts',            description: 'System alerts and notifications' },
  { label: 'App Store',     href: '/apps',              description: 'Browse installable app integrations' },
  { label: 'Standardization', href: '/standardization', description: 'Repository standardization controls' },
];

export const NAV_PROJECT_CONTEXT: NavItem[] = [
  { label: 'Project Dashboard',       href: '/project/:owner/:repo/dashboard',  description: 'Per-project overview (replace :owner/:repo)' },
  { label: 'Project Kanban',          href: '/project/:owner/:repo/kanban',     description: 'Per-project Kanban board' },
  { label: 'Project Chat',            href: '/project/:owner/:repo/chat',       description: 'Per-project AI chat' },
  { label: 'Project Roadmap',         href: '/project/:owner/:repo/roadmap',    description: 'Per-project roadmap' },
  { label: 'Project PR Center',       href: '/project/:owner/:repo/pr-center',  description: 'Pull-request command center' },
  { label: 'Project Reverse Engineering', href: '/project/:owner/:repo/reverse-engineering', description: 'Run reverse-engineering analysis for a project repository' },
  { label: 'Project Tools',           href: '/project/:owner/:repo/tools',      description: 'Per-project toolbox' },
  { label: 'Project Cloudflare Docs', href: '/project/:owner/:repo/tools/cloudflare-docs', description: 'Project-scoped Cloudflare Docs Agent' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Combined export — the authoritative sitemap sections list
// ─────────────────────────────────────────────────────────────────────────────

export const SITEMAP_SECTIONS: NavSection[] = [
  { group: 'Global Navigation',   items: NAV_GLOBAL },
  { group: 'Operations',          items: NAV_OPERATIONS },
  { group: 'Global Tools — Toolbox',       items: NAV_TOOLBOX },
  { group: 'Global Tools — Deep Research', items: NAV_RESEARCH },
  { group: 'System',              items: NAV_SYSTEM },
  { group: 'Project Context',     items: NAV_PROJECT_CONTEXT },
];
