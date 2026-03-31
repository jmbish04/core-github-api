/**
 * @file backend/src/do/AgentStubs.ts
 * @description Minimal stubs for Durable Object classes that exist in production
 * but whose full implementations are not in this branch. These stubs satisfy
 * Cloudflare's requirement that all registered DO classes must be exported.
 */

import { DurableObject } from 'cloudflare:workers';

class BaseStub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    return new Response('Not implemented in this branch', { status: 501 });
  }
}

export class JulesPrReviewer extends BaseStub {}
export class AgentSessionDO extends BaseStub {}
export class SandboxAgent extends BaseStub {}
export class HoniOrchestrator extends BaseStub {}
export class HoniConsultant extends BaseStub {}
export class PlanningMonitor extends BaseStub {}
export class ReverseEngineeringMonitor extends BaseStub {}
export class PlanningSupervisorAgent extends BaseStub {}
export class PlanningOrchestratorAgent extends BaseStub {}
export class DiscordResearchAgent extends BaseStub {}
export class UxResearcher extends BaseStub {}
