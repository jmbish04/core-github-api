/**
 * @file services/agentic-session/index.ts
 * @description Public API surface for AgenticSession service.
 *   Exports getSession, createSession, SessionClient, and all types.
 */

export { SessionClient } from './client';
export { createSession, getSession } from './factory';
export * from './types';
export type { SessionClientOptions } from './client';
