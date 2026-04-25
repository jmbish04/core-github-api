/**
 * @file OrchestratorAgent/methods/plan.ts
 * @description Absorbed from planning/Orchestrator.ts + planning/Planner.ts + retrofit.ts.
 *              Provides plan breakdown, orchestration, and retrofit capabilities.
 *              Pure functions with DI.
 */
import { z } from "zod";
import { PlanningWorkstreamSchema } from "@/lib/schemas/jules";
import {
  derivePlanBreakdownFromMarkdown,
  persistPlanBreakdown,
} from "@/services/planning/babysitter";
import {
  runStructuredChat,
  type StructuredChatResult,
  type AIProvider,
  type AgentStateStore,
  type StructuredChatState,
} from '@/ai/providers';

// ── Types ──────────────────────────────────────────────────────────────
const PlanningOrchestrationRequestSchema = z.object({
  requestId: z.string(),
  workstream: PlanningWorkstreamSchema,
  markdown: z.string().min(1),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
});

type OrchestrationInput = z.infer<typeof PlanningOrchestrationRequestSchema>;

type PlanDeps = {
  ai: AIProvider;
  env: Env;
};

type RetrofitDeps = {
  ai: AIProvider;
  store: AgentStateStore<StructuredChatState>;
};

// ── Planning Orchestrator Methods (from PlanningOrchestratorAgent) ────

/**
 * Derive breakdown from approved planning markdown.
 * Absorbed from PlanningOrchestratorAgent.breakdown().
 */
export async function planBreakdown(
  deps: PlanDeps,
  input: OrchestrationInput,
): Promise<{ success: boolean; breakdown: any }> {
  const payload = PlanningOrchestrationRequestSchema.parse(input);
  const result = await derivePlanBreakdownFromMarkdown(deps.env, payload);
  return { success: true, breakdown: result };
}

/**
 * Derive breakdown and persist it to D1.
 * Absorbed from PlanningOrchestratorAgent.orchestrate().
 */
export async function planOrchestrate(
  deps: PlanDeps,
  input: OrchestrationInput,
): Promise<{ success: boolean; breakdown: any }> {
  const payload = PlanningOrchestrationRequestSchema.parse(input);
  const result = await derivePlanBreakdownFromMarkdown(deps.env, payload);
  await persistPlanBreakdown(deps.env, payload, result);
  return { success: true, breakdown: result };
}

// ── Planner Methods (from PlannerAgent) ─────────────────────────────

/**
 * Generate an implementation plan via AI.
 * Absorbed from PlannerAgent.chat().
 */
export async function planChat(
  deps: PlanDeps,
  message: string,
  options?: { model?: string },
): Promise<string> {
  const systemPrompt = `Create an implementation plan for the user goal. Return a concise, execution-ready plan.`;
  return deps.ai.generateText(message, systemPrompt, { skills: ['plan-writing', 'architecture'], ...(options?.model ? { model: options.model } : {}) });
}

/**
 * Derive plan breakdown from markdown (Planner variant).
 * Absorbed from PlannerAgent.breakdown().
 */
export async function plannerBreakdown(
  deps: PlanDeps,
  payload: {
    requestId: string;
    workstream: z.infer<typeof PlanningWorkstreamSchema>;
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
): Promise<any> {
  return derivePlanBreakdownFromMarkdown(deps.env, payload);
}

// ── Retrofit Methods (from RetrofitAgent) ────────────────────────────

/**
 * Chat with the retrofit specialist.
 * Absorbed from RetrofitAgent.chat().
 */
export async function retrofitChat(
  deps: RetrofitDeps,
  message: string,
  history: unknown[] = [],
  context?: unknown,
  source = "api",
  sessionId = "default",
  requestedModel?: string,
): Promise<StructuredChatResult> {
  return runStructuredChat({
    ai: deps.ai,
    store: deps.store,
    agentName: "RetrofitAgent",
    systemPrompt:
      "You are RetrofitAgent, a repository retrofit specialist for Cloudflare Worker applications.",
    message,
    history,
    context,
    source,
    sessionId,
    requestedModel,
  });
}
