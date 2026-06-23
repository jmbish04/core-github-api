import type { GuardrailAgent } from "../index";
import type { EvaluationPayload, VerdictIssue, CorrectionPrompt } from "../types";

import { z } from "zod";

interface JudgeResult {
  issues: VerdictIssue[];
  corrections: CorrectionPrompt[];
}

/**
 * AI-powered code quality scoring. Uses the AIProvider to evaluate
 * code against best practices for readability, maintainability,
 * and adherence to the project's conventions.
 */
export async function judgeCodeQuality(
  agent: GuardrailAgent,
  payload: EvaluationPayload,
): Promise<JudgeResult> {
  const issues: VerdictIssue[] = [];
  const corrections: CorrectionPrompt[] = [];

  if (!payload.files.length) return { issues, corrections };

  try {
    const filesSummary = payload.files
      .map((f) => `### ${f.path}\n\`\`\`${f.language || ""}\n${f.content.slice(0, 2000)}\n\`\`\``)
      .join("\n\n");

    const prompt = `You are a senior code reviewer. Analyze the following files for:
1. TypeScript best practices violations
2. Missing error handling
3. Potential memory leaks or performance issues
4. Unused imports or dead code
5. Naming convention violations

Files to review:
${filesSummary}`;

    const schema = z.array(z.object({
      severity: z.union([z.literal("info"), z.literal("warning"), z.literal("error")]).optional(),
      rule: z.string().optional(),
      file: z.string().optional(),
      message: z.string()
    }));

    const result = await agent.getAI().generateStructuredResponse(
      prompt,
      schema,
      undefined,
      { skills: agent.getSkills() }
    );

    for (const item of result) {
      issues.push({
        severity: item.severity || "info",
        rule: `quality:${item.rule || "generic"}`,
        file: item.file || "unknown",
        message: item.message,
      });
    }
  } catch (err) {
    console.error("[GuardrailAgent:judge] AI evaluation failed:", err);
  }

  return { issues, corrections };
}
