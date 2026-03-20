/**
 * @file src/frontend/src/components/docs/agents-registry.ts
 * @description Agent registry types and hook re-export.
 * The actual data is served from D1 via GET /api/docs/agents.
 *
 * ⚠️  The static AGENTS array has been removed.
 *     Use the `useAgentsRegistry` hook or the API directly.
 */
export type { AgentEntry } from '@/hooks/useAgentsRegistry';
export { useAgentsRegistry } from '@/hooks/useAgentsRegistry';
