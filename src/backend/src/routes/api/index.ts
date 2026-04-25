/**
 * @file routes/api/index.ts
 * @description Barrel re-export of every API sub-router.
 *
 * Route files are organized into domain subdirectories:
 *   agents/   — Agent orchestration, planning, research, learning
 *   ops/      — Health, workflows, standardization, skills, GHA actions
 *   frontend/ — UI-facing routes (workshop, planner, alerts, backlog, HITL)
 *   webhooks/ — GitHub webhook receiver, jules webhooks
 *   cloudflare/ — CF services, AI gateway
 *   sentinel/ — Sentinel insights
 *   projects/ — Per-project routes (sentinel)
 *   sandbox/  — Sandbox proxy
 *   docs/     — Documentation API
 *   ux/       — UX researcher
 */

// ── Agent domain ────────────────────────────────────────────────────────
export { default as planningApi } from './agents/planning';
export { default as agentPlanningApi } from './agents/agent-planning';
export { default as reverseEngineeringApi } from './agents/reverse-engineering';
export { default as researchOrchestrationApi } from './agents/research-orchestration';
export { default as continuousLearningApi } from './agents/continuous-learning';
export { default as stitchApi } from './agents/stitch';
export { default as agentsApi } from './agents/index';

// ── Ops domain ──────────────────────────────────────────────────────────
export { default as actionsApi } from './ops/actions';
export { default as skillsApi } from './ops/skills';
export { standardizationRouter } from './ops/standardization';
export { default as healthApi } from './ops/health';
export { default as workflowsApi } from './ops/workflows';

// ── Frontend domain ─────────────────────────────────────────────────────
export { default as workshopApi } from './frontend/workshop';
export { default as projectsApi } from './frontend/repos/index';
export { default as todosApi } from './frontend/planner/todos';
export { default as alertsApi } from './frontend/alerts';
export { default as settingsApi } from './frontend/settings';
export { default as tasksApi } from './frontend/planner/tasks';
export { default as timelineApi } from './frontend/planner/timeline';
export { default as backlogApi } from './frontend/backlog';
export { default as researchProjectsApi } from './frontend/research/one-time';
export { hitlApi } from './frontend/hitl';
export { default as prConflictsApi } from './frontend/repos/pr-conflicts';

// ── Webhooks / Jules ────────────────────────────────────────────────────
export { default as julesApi } from './jules';
export { default as julesWebhookApi } from './webhooks/jules';
export { default as webhooksApi } from './webhooks/index';
export { default as actionCallbackApi } from './webhooks/action-callback';
export { default as researchJudgeApi } from './webhooks/research-judge';

// ── WebSocket ───────────────────────────────────────────────────────────
export { default as actionWorkerWsApi } from './ws/action-worker';

// ── Cloudflare / AI ─────────────────────────────────────────────────────
export { default as aiGatewayApi } from './ai/gateway';
export { default as cloudflareApi } from './cloudflare/index';
export { default as cloudflareServicesApi } from './services/cloudflare';

// ── Docs / UX / Sandbox / Sentinel / Governance ─────────────────────────
export { docsAgentsRouter } from './docs/agents';
export { default as commentsTools } from '@/ai/mcp/tools/github/comments';
export { default as uxApi } from './ux/index';
export { default as sandboxApi } from './sandbox';
export { default as sandboxProxyApi } from './sandbox/proxy';
export { default as sentinelApi } from './projects/sentinel/index';
export { default as sentinelInsightsApi } from './sentinel/index';
