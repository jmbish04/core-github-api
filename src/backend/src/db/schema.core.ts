/**
 * @file db/schema.core.ts
 * Drizzle-kit schema barrel — EXCLUSIVELY for drizzle.config.core.ts migrations.
 *
 * GOVERNANCE: This file intentionally EXCLUDES schemas/github/webhooks.ts
 * and schemas/webhooks/automations.ts (those are owned by DB_WEBHOOKS).
 *
 * DO NOT use this file for TypeScript application imports — use schema.ts instead.
 * DO NOT add github/webhooks.ts here under any circumstance.
 */
export * from './schemas/agents';
export * from './schemas/app';
export * from './schemas/discord';
export * from './schemas/containers';
export * from './schemas/docs';

// GitHub domain — application tables ONLY (repos, prs, reviews, etc.)
// webhook event tables live in schemas/github/webhooks.ts → DB_WEBHOOKS
export * from './schemas/github/drafts';
export * from './schemas/github/favorites';
export * from './schemas/github/pr_overviews';
export * from './schemas/github/prs';
export * from './schemas/github/repos';
export * from './schemas/github/research';
export * from './schemas/github/reviews';
export * from './schemas/github/stars';

export * from './schemas/jules';
export * from './schemas/logs';  // includes automation.ts (moved from webhooks)
export * from './schemas/ops';
export * from './schemas/projects';

// Webhooks domain — only automation_rules, NOT webhook_configs (owned by DB_WEBHOOKS)
// webhook_configs and automations.ts are excluded here
export * from './schemas/workflows';
export * from './schemas/workshop';

// EPIC-0: AgenticSession service schemas (sessions / session_events / session_subscribers / session_grants)
// Schemas live in services/agentic-session/schemas/ alongside the service module itself, not under db/schemas/.
export * from '../services/agentic-session/schemas';
