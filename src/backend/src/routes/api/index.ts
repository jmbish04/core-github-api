/**
 * @file routes/api/index.ts
 * @description Barrel re-export of every API sub-router.
 */

export { default as planningApi } from './planning';
export { default as agentPlanningApi } from './agent-planning';
export { default as reverseEngineeringApi } from './reverse-engineering';
export { default as julesApi } from './jules';
export { default as julesWebhookApi } from './webhooks/jules';
export { default as actionsApi } from './actions';
export { default as actionCallbackApi } from './webhooks/action-callback';
export { default as actionWorkerWsApi } from './ws/action-worker';
export { default as researchJudgeApi } from './webhooks/research-judge';
export { default as researchOrchestrationApi } from './research-orchestration';
export { default as aiGatewayApi } from './ai/gateway';
export { default as skillsApi } from './skills';
export { default as stitchApi } from './stitch';
export { default as webhooksApi } from './webhooks/index';
export { default as workflowsApi } from './ops/workflows';
export { default as workshopApi } from './frontend/workshop';
export { default as projectsApi } from './frontend/repos/index';
export { default as todosApi } from './frontend/planner/todos';
export { default as agentsApi } from './agents/index';
export { default as alertsApi } from './frontend/alerts';
export { default as settingsApi } from './frontend/settings';
export { default as tasksApi } from './frontend/planner/tasks';
export { default as timelineApi } from './frontend/planner/timeline';
export { default as healthApi } from './ops/health';
export { learningHealthApi } from './ops/health';
export { standardizationRouter } from './standardization';
export { default as cloudflareApi } from './cloudflare/index';
export { default as uxApi } from './ux/index';
export { docsAgentsRouter } from './docs/agents';
export { default as prReviewerApi } from '@/ai/agents/pr-reviewer/JulesPrReviewer';
export { default as commentsTools } from '@/ai/mcp/tools/github/comments';
export { default as cloudflareServicesApi } from './services/cloudflare';
export { default as sandboxApi } from './sandbox';
export { default as researchProjectsApi } from './frontend/research/one-time';
export { default as sentinelApi } from './projects/sentinel/index';
export { default as sentinelInsightsApi } from './sentinel/index';
export { default as prManagerApi } from './pr-manager';
