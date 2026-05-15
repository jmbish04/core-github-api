/**
 * @file routes/index.ts
 * @description Mounts all API routes onto the Hono app instance.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  planningApi,
  agentPlanningApi,
  reverseEngineeringApi,
  julesApi,
  julesWebhookApi,
  actionsApi,
  actionCallbackApi,
  actionWorkerWsApi,
  researchJudgeApi,
  researchOrchestrationApi,
  aiGatewayApi,
  skillsApi,
  stitchApi,
  webhooksApi,
  workflowsApi,
  workshopApi,
  projectsApi,
  todosApi,
  agentsApi,
  alertsApi,
  settingsApi,
  tasksApi,
  timelineApi,
  healthApi,
  standardizationRouter,
  cloudflareApi,
  cloudflareServicesApi,
  uxApi,
  docsAgentsRouter,
  commentsTools,
  sandboxApi,
  researchProjectsApi,
  sentinelApi,
  sentinelInsightsApi,
  backlogApi,
  continuousLearningApi,
  hitlApi,
  observabilityApi,
  chatFrontendApi,
  sessionsApi,
} from './api';

/**
 * Mount every API sub-router onto the given Hono app and return the
 * fully-typed chain so `AppType` can be derived from the result.
 */
export function mountRoutes(app: OpenAPIHono<{ Bindings: Env }>) {
  return app
    .route('/api/agents/chat-rooms', agentPlanningApi)
    .route('/api/planning', planningApi)
    .route('/api/reverse-engineering', reverseEngineeringApi)
    .route('/api/jules', julesApi)
    .route('/api/webhooks/jules', julesWebhookApi)
    .route('/api/actions', actionsApi)
    .route('/api/webhooks/action-callback', actionCallbackApi)
    .route('/api/ws/action-worker', actionWorkerWsApi)
    .route('/api/webhooks/research-judge', researchJudgeApi)
    .route('/api/orchestration', researchOrchestrationApi)
    .route('/api/ai/gateway', aiGatewayApi)
    .route('/api/tools/comments', commentsTools)
    .route('/api/skills', skillsApi)
    .route('/api/stitch', stitchApi)
    .route('/api/webhooks', webhooksApi)
    .route('/api/workshop', workshopApi)
    .route('/api/projects', projectsApi)
    .route('/api/repos', projectsApi)
    .route('/api/frontend/todos', todosApi)
    .route('/api/alerts', alertsApi)
    .route('/api/settings', settingsApi)
    .route('/api/tasks', tasksApi)
    .route('/api/timeline', timelineApi)
    .route('/api/chat', chatFrontendApi)
    .route('/api/agents', agentsApi)
    .route('/api/health', healthApi)
    .route('/api/ops/workflows', workflowsApi)
    .route('/api/standardization', standardizationRouter)
    .route('/api/cloudflare', cloudflareApi)
    .route('/api/services/cloudflare', cloudflareServicesApi)
    .route('/api/ux', uxApi)
    .route('/api/docs/agents', docsAgentsRouter)
    .route('/api/sandbox', sandboxApi)
    .route('/api/research', researchProjectsApi)
    .route('/api/projects/sentinel', sentinelApi)
    .route('/api/sentinel', sentinelInsightsApi)
    .route('/api/backlog', backlogApi)
    .route('/api/continuous-learning', continuousLearningApi)
    .route('/api/hitl', hitlApi)
    .route('/api/observability', observabilityApi)
    .route('/api/sessions', sessionsApi);
}
