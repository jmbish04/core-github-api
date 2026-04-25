/**
 * @file ai/agents/exports.ts
 * @description Barrel re-export of every Durable Object agent class.
 *              Consumed by the root exports.ts for the Worker entry point.
 *
 * Architecture: Agents (10 canonical agents + infrastructure DOs)
 * Migration: v6 — legacy classes deleted, new Agent classes added.
 */

// ── Chat Agents (3 canonical) ─────────────────────────────────────────
export { CloudflareAgent } from './chat/CloudflareAgent';
export { WorkshopAgent } from './chat/WorkshopAgent';
export { CoordinatorAgent } from './chat/CoordinatorAgent';

// ── Backend Agents (7 canonical) ─────────────────────────────────────────
export { GithubAgent } from './backend/GithubAgent';
export { DesignAgent } from './backend/DesignAgent';
export { EngineerAgent } from './backend/EngineerAgent';
export { GuardrailAgent } from './backend/GuardrailAgent';
export { LearningAgent } from './backend/LearningAgent';
export { OrchestratorAgent } from './backend/OrchestratorAgent';
export { ResearchAgent } from './backend/ResearchAgent';
export { CollaborationAgent } from './backend/CollaborationAgent';


// ── Workflows ───────────────────────────────────────────────────────────────
export { JulesResearchWorkflow } from './workflows/GithubResearch';
export { ContinuousLearningWorkflow } from './workflows/ContinuousLearning';
