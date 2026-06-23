/**
 * @file EngineerAgent/methods/sandbox/git/conflicts/resolveWithAI.ts
 * @description AI fallback for conflict resolution using the Worker-side AIProvider.
 *              Used when opencode fails or is skipped.
 *              Keeps all LLM calls on the Worker side — no API keys inside the sandbox.
 */

import { AIProvider } from "@/ai/providers";
import { Logger } from "@/lib/logger";
import type { ConflictFile, ConflictResolution } from "./types";

const PROMPT_SYSTEM = `You are an expert software engineer resolving git merge conflicts.
Given two versions of a code block (HEAD = ours, MERGE_HEAD = theirs), produce the optimal
merged result that satisfies the intent of both changes.

Rules:
- Output ONLY the final merged file content. No markers, no commentary, no code fences.
- Preserve all logic from both sides where possible.
- If changes contradict, prefer HEAD (ours) unless the theirs version is strictly additive.
- Keep formatting consistent with the surrounding code.`;

/**
 * For each ConflictFile that could not be resolved by opencode (confidence === 0),
 * sends the conflict to the Worker-side AIProvider and returns a ConflictResolution.
 */
export async function resolveWithAI(
  env: Env,
  conflicts: ConflictFile[]
): Promise<ConflictResolution[]> {
  const logger = new Logger(env, "SandboxSDK - resolveWithAI");
  const ai = new AIProvider(env);
  const resolutions: ConflictResolution[] = [];

  for (const conflict of conflicts) {
    const tag = `[resolveWithAI][${conflict.path}]`;

    try {
      logger.info(`${tag} Resolving via AIProvider...`);

      const prompt = [
        `File: ${conflict.path}`,
        "",
        "## HEAD (ours):",
        "```",
        conflict.ours,
        "```",
        "",
        "## MERGE_HEAD (theirs):",
        "```",
        conflict.theirs,
        "```",
        "",
        "## Full conflict file (with markers):",
        "```",
        conflict.rawConflict,
        "```",
        "",
        "Produce the fully resolved file content without any conflict markers.",
      ].join("\n");

      const result = await ai.generateText(prompt, PROMPT_SYSTEM, {
        provider: "worker-ai",
        model: env.DEFAULT_MODEL_REASONING,
        skills: ['engineering', 'jules-orchestration', 'code-review'],
      });

      const resolved = result?.trim() ?? "";

      if (!resolved || resolved.includes("<<<<<<<")) {
        logger.warn(`${tag} AI returned empty or still-conflicted content`);
        resolutions.push({
          path: conflict.path,
          resolvedContent: conflict.ours, // safe fallback: take ours
          strategy: "ours",
          confidence: 0.3,
        });
        continue;
      }

      logger.info(`${tag} ✓ Resolved by AI (${resolved.length} bytes)`);
      resolutions.push({ path: conflict.path, resolvedContent: resolved, strategy: "ai", confidence: 0.75 });
    } catch (error: any) {
      logger.error(`${tag} AI resolution failed: ${error.message}`);
      // Final safe fallback: accept ours
      resolutions.push({
        path: conflict.path,
        resolvedContent: conflict.ours,
        strategy: "ours",
        confidence: 0.2,
      });
    }
  }

  return resolutions;
}
