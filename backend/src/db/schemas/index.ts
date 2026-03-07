/**
 * @file db/schemas/index.ts
 * Master schema barrel — re-exports every table in the database.
 * Import from "@db" (which re-exports this file) for clean access.
 *
 * Each line here represents one feature domain:
 */
export * from './agents';
export * from './app';
export * from './containers';
export * from './github';
export * from './jules';
export * from './logs';
export * from './ops';
export * from './projects';
export * from './webhooks';
export * from './workflows';
export * from './workshop';
