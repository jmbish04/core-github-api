// env.DB
/**
 * @file schemas/webhooks/index.ts
 * Barrel for all webhook-adjacent event schemas.
 * Add additional webhook-driven tables here (e.g. github/webhooks,
 * jules webhook-events) as the project grows.
 */
export * from './task_events';
export * from './automations';
