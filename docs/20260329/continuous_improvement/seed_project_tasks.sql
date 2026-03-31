-- ============================================================
-- seed_project_tasks.sql
-- Generated: 2026-03-31 12:05:28 UTC
-- Source:    project_tasks.json (pm_* → backlog tables)
-- Repo:      github:jmbish04/core-github-api
-- Tables:    epics, stories, tasks
-- Strategy:  INSERT OR IGNORE (idempotent — safe to re-run)
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ──────────────────────────────────────────────
-- epics  (8 rows)  [mapped from pm_epics]
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-001-schema', 'github:jmbish04/core-github-api', 'Database Schema — Sentinel Micro-Domain', 'Establish the 10-table Drizzle ORM schema domain. Includes auto-migration scripts in package.json to remove manual deployment friction.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-002-ingestion', 'github:jmbish04/core-github-api', 'Native Ingestion Service', 'Native Worker service replacing the legacy Python script. Ingests Jules sessions, GitHub PR comments, and Stitch prompts directly into D1 with sourceIdentifier deduplication.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-003-analyst', 'github:jmbish04/core-github-api', 'Repoless Analyst Agent', 'Uses jules-sdk in repoless mode (Gemini 3.1 1M context) to extract ''Agentic Sentinality Insights'' from bulk conversation data.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-004-babysitter', 'github:jmbish04/core-github-api', 'Babysitter Agent (Orchestrator)', 'Durable Object monitor that listens to active Jules streams and performs [SYSTEM OVERRIDE] interventions when apology loops are detected.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-005-api', 'github:jmbish04/core-github-api', 'Hono OpenAPI Control Plane', 'Zod-validated routes at /api/sentinel serving dynamically generated openapi.json, swagger, and scalar documentation.', 'todo', 'medium', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-006-interceptor', 'github:jmbish04/core-github-api', 'Active PR Interceptor', 'Real-time remediation service firing on GitHub webhooks. Posts comments via human-persona GH_TOKEN to bypass bot filters.', 'todo', 'medium', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-007-frontend', 'github:jmbish04/core-github-api', 'Sentinel C2 Dashboard (Astro)', 'Responsive ''Monolith'' theme views with consistent sidebar navigation and tonal Zinc depth for visual hierarchy. No borders allowed.', 'todo', 'low', 1774958728, 1774958728);
INSERT OR IGNORE INTO epics (id, repo_id, title, description, status, priority, created_at, updated_at) VALUES ('epic-008-health', 'github:jmbish04/core-github-api', 'Health & Telemetry Governance', 'Self-monitoring service for AI Gateway latency and Sentinel operational status.', 'todo', 'low', 1774958728, 1774958728);

-- ──────────────────────────────────────────────
-- stories  (5 rows)  [mapped from pm_stories]
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO stories (id, repo_id, parent_id, title, description, status, priority, created_at, updated_at) VALUES ('story-001-01', 'github:jmbish04/core-github-api', 'epic-001-schema', 'Sentinel Ledger Table Set', 'Create the core 10 tables for pattern retention and contemplation reflection.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO stories (id, repo_id, parent_id, title, description, status, priority, created_at, updated_at) VALUES ('story-001-02', 'github:jmbish04/core-github-api', 'epic-001-schema', 'Infrastructure Automation', 'Configure automated migrations and type generation in package.json.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO stories (id, repo_id, parent_id, title, description, status, priority, created_at, updated_at) VALUES ('story-003-01', 'github:jmbish04/core-github-api', 'epic-003-analyst', 'Deep Pattern Research', 'Implement repoless Jules tools to analyze conversation artifacts for ''Agentic Sentinality''.', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO stories (id, repo_id, parent_id, title, description, status, priority, created_at, updated_at) VALUES ('story-006-01', 'github:jmbish04/core-github-api', 'epic-006-interceptor', 'PR Interceptor Webhook Handler', 'Implement sentinel-handler.ts that fires on pull_request.opened/synchronize webhooks and posts remediation comments using GITHUB_PERSONAL_ACCESS_TOKEN (human-persona GH_TOKEN).', 'todo', 'high', 1774958728, 1774958728);
INSERT OR IGNORE INTO stories (id, repo_id, parent_id, title, description, status, priority, created_at, updated_at) VALUES ('story-007-01', 'github:jmbish04/core-github-api', 'epic-007-frontend', 'Unified Layout & Sidebar', 'Ensure layout consistency across all Sentinel pages with mobile responsiveness. AppSidebar on all pages. Zero borders. Zinc-950 backgrounds.', 'todo', 'high', 1774958728, 1774958728);

-- ──────────────────────────────────────────────
-- tasks  (7 rows)  [mapped from pm_tasks]
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-001-02-01', 'github:jmbish04/core-github-api', 'story-001-02', 'Add db:auto Script to package.json', 'Add ''db:auto'': ''pnpm run db:generate:all && pnpm run migrate:local:all && wrangler types'' to root package.json. This chains the existing db:generate:all and migrate:local:all scripts with wrangler types regeneration for zero-touch migrations.', 'todo', 'high', 1, 'backlog');
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-001-02-02', 'github:jmbish04/core-github-api', 'story-001-02', 'Add new_sqlite_classes to wrangler.jsonc', 'Add migrations entry with new_sqlite_classes: [''LearningAgent'', ''BabysitterAgent'']. NEVER use new_classes for SQLite-backed Durable Objects — it does not initialize the SQLite storage layer required by @cloudflare/agents.', 'todo', 'high', 2, 'backlog');
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-001-02-03', 'github:jmbish04/core-github-api', 'story-001-02', 'Create .agent/rules/durable_objects.md', 'Fleet guardrail rule enforcing new_sqlite_classes for all SQLite-backed Durable Objects. Include the wrong/correct wrangler.jsonc examples and the reason (runtime error: SQLite storage not available).', 'todo', 'high', 3, 'backlog');
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-003-01-01', 'github:jmbish04/core-github-api', 'story-003-01', 'Implement Repoless Analyst DeepResearch', 'Create SentinelAnalyst.ts tool that instantiates Jules with repoless:true to identify ''square wheel'' patterns across massive context.', 'todo', 'high', 1, 'backlog');
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-004-01-01', 'github:jmbish04/core-github-api', 'story-003-01', 'Implement Babysitter [SYSTEM OVERRIDE]', 'Build Durable Object logic to interact with active Jules streams and inject mandatory guardrail corrections during apology loops.', 'todo', 'high', 2, 'backlog');
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-006-01-01', 'github:jmbish04/core-github-api', 'story-006-01', 'Deploy PR Interceptor with Human Token', 'Configure GitHub comments to use GH_TOKEN (user persona) to ensure Sentinel''s instructions are processed by downstream bots.', 'todo', 'high', 1, 'backlog');
INSERT OR IGNORE INTO tasks (id, repo_id, parent_id, title, description, status, priority, position, kanban_column) VALUES ('task-007-01-01', 'github:jmbish04/core-github-api', 'story-007-01', 'Monolith UI Layout Guardrails', 'Implement AppSidebar on all pages. Forbid border classes. Enforce 1440x900 and 390x844 viewport standards.', 'todo', 'high', 1, 'backlog');

PRAGMA foreign_keys = ON;

-- ✅ Seed complete: 8 epics, 5 stories, 7 tasks
-- repo_id: github:jmbish04/core-github-api