/**
 * @file EngineerAgent/methods/sandbox/git/conflicts/resolveWithOpenCode.ts
 * @description Uses the pre-installed `opencode` CLI inside the sandbox container
 *              to AI-resolve merge conflicts in each conflicting file.
 *
 * OpenCode is baked into our custom Dockerfile:
 *   FROM docker.io/cloudflare/sandbox:0.8.8-opencode AS opencode-stage
 *   RUN ln -s /usr/local/lib/node_modules/opencode-ai/bin/opencode /usr/local/bin/opencode
 *
 * The `ANTHROPIC_API_KEY` is injected at session creation time via `startProcess` env vars.
 */

import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { ConflictFile, ConflictResolution } from "./types";

const CONFLICT_MARKER_RE = /^<{7} /m;

/**
 * For each ConflictFile, invokes `opencode run` inside the sandbox with a
 * precise prompt instructing it to rewrite the file without markers.
 * Returns a ConflictResolution per file. Failures produce `confidence: 0`.
 */
export async function resolveWithOpenCode(
  env: Env,
  conflicts: ConflictFile[],
  workDir: string,
  sessionId: string
): Promise<ConflictResolution[]> {
  const logger = new Logger(env, "SandboxSDK - resolveWithOpenCode");
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const resolutions: ConflictResolution[] = [];

  for (const conflict of conflicts) {
    const tag = `[resolveWithOpenCode][${conflict.path}]`;
    const absPath = `${workDir}/${conflict.path}`;

    try {
      logger.info(`${tag} Running opencode on ${conflict.path}...`);

      // Write a companion instruction file that opencode will read as context
      const promptFile = `${workDir}/.colby-resolve-prompt-${Date.now()}.md`;
      await sandbox.writeFile(
        promptFile,
        [
          `You are resolving a git merge conflict in the file: ${conflict.path}`,
          "",
          "TASK: Rewrite the file below so that all merge conflict markers",
          "(<<<<<<<, =======, >>>>>>>) are removed and the best semantically-correct",
          "combination of both changes is preserved.",
          "",
          "Rules:",
          "- Do NOT include <<<<<<< ======= >>>>>>> markers in your output.",
          "- Preserve ALL logic from both branches where possible.",
          "- If the changes are contradictory, prefer the HEAD (ours) version.",
          "- Output ONLY the final file content, no commentary.",
        ].join("\n")
      );

      // opencode in non-interactive mode: read prompt + file, write file in-place
      const result = await sandbox.exec(
        [
          `cd ${workDir}`,
          `&& cat ${promptFile} | opencode run`,
          `--no-interactive`,
          `--instructions "$(cat ${promptFile})"`,
          absPath,
        ].join(" "),
        { timeout: 120_000 }
      );

      logger.info(`${tag} opencode exit=${result.exitCode}, stderr=${result.stderr?.slice(0, 200)}`);

      // Clean up prompt file
      await sandbox.exec(`rm -f ${promptFile}`);

      if (result.exitCode !== 0) {
        logger.warn(`${tag} opencode non-zero exit — will be picked up by AI fallback`);
        resolutions.push({ path: conflict.path, resolvedContent: "", strategy: "opencode", confidence: 0 });
        continue;
      }

      // Read back the resolved file
      const readResult = await sandbox.readFile(absPath);
      const resolved = readResult.content ?? "";

      if (CONFLICT_MARKER_RE.test(resolved)) {
        logger.warn(`${tag} opencode left conflict markers — deferring to AI fallback`);
        resolutions.push({ path: conflict.path, resolvedContent: "", strategy: "opencode", confidence: 0 });
        continue;
      }

      logger.info(`${tag} ✓ Resolved by opencode (${resolved.length} bytes)`);
      resolutions.push({ path: conflict.path, resolvedContent: resolved, strategy: "opencode", confidence: 0.9 });
    } catch (error: any) {
      logger.error(`${tag} opencode threw: ${error.message}`);
      resolutions.push({ path: conflict.path, resolvedContent: "", strategy: "opencode", confidence: 0 });
    }
  }

  return resolutions;
}
