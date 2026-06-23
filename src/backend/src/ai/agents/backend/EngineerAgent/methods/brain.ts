import type { EngineerAgent } from "../index";
import type { BrainEvaluation, Subtask } from "../types";
import { z } from "zod";

const BrainEvaluationSchema = z.object({
  decision: z.enum(["solo", "fleet", "triangle", "stitch-only"]),
  reasoning: z.string(),
  subtasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    files: z.array(z.string()).optional(),
    role: z.enum(["solo", "fleet-member", "stitch", "merge"]),
  })),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

/**
 * Brain evaluation — the decision-maker that analyzes a sprint and
 * determines the execution strategy: solo, fleet, triangle, or stitch-only.
 *
 * Uses AIProvider.generateStructuredResponse to produce typed output.
 */
export async function evaluateSprint(
  agent: EngineerAgent,
  sprintTitle: string,
  sprintDescription: string,
  files?: string[],
): Promise<BrainEvaluation> {
  try {
    const prompt = `You are a Software Engineering AI analyzing a sprint task. Evaluate the following and decide the execution strategy:

Sprint: ${sprintTitle}
Description: ${sprintDescription}
${files?.length ? `Files involved: ${files.join(", ")}` : ""}

Decide ONE strategy:
- "solo": Single Jules session can handle it (simple, ≤3 files)
- "fleet": Multiple parallel Jules sessions needed (complex, many files, independent subtasks)
- "triangle": Requires both Jules (code) + Stitch (UI) coordination
- "stitch-only": Pure UI/design work, no backend changes`;

    const parsed = await (agent as any).ai.generateStructuredResponse(prompt, BrainEvaluationSchema, {
      skills: (agent as any).skills,
    });

    return {
      decision: parsed.decision || "solo",
      reasoning: parsed.reasoning || "Default to solo execution",
      subtasks: (parsed.subtasks || []).map((st: any, i: number) => ({
        ...st,
        id: st.id || `subtask-${i}`,
        status: "pending" as const,
      })),
      estimatedComplexity: parsed.estimatedComplexity || "medium",
    };
  } catch (err) {
    console.error("[EngineerAgent:brain] AI evaluation failed:", err);
    return {
      decision: "solo",
      reasoning: "Fallback to solo due to AI evaluation failure",
      subtasks: [{
        id: "subtask-0",
        title: sprintTitle,
        description: sprintDescription,
        role: "solo",
        status: "pending",
      }],
      estimatedComplexity: "medium",
    };
  }
}
