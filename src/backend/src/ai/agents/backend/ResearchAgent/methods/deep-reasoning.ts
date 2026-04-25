/**
 * @file ResearchAgent/methods/deep-reasoning.ts
 * @description Absorbed from DeepReasoningAgent.ts — deep technical reasoning
 *              via AI with skills context injection. Pure functions with DI.
 */

import type { AIProvider } from "@/ai/providers";

// ── Types ──────────────────────────────────────────────────────────────
type DeepReasoningDeps = {
  ai: AIProvider;
  env: Env;
};

// ── Methods ────────────────────────────────────────────────────────────

/**
 * Deep technical reasoning with structured output.
 * Absorbed from DeepReasoningAgent.chat().
 */
export async function deepReason(
  deps: DeepReasoningDeps,
  message: string,
  options?: { model?: string },
): Promise<string> {
  const systemPrompt = `You are a deep technical reasoning assistant. Return only output that matches the requested JSON schema.`;
  return deps.ai.generateText(
    message,
    systemPrompt,
    { ...options, skills: ['deep-research', 'brainstorming', 'source-evaluation'] },
  );
}
