/**
 * @file EngineerAgent/methods/sandbox/git/conflicts/commitResolution.ts
 * @description Writes resolved file content back into the sandbox workspace,
 *              stages, commits, and pushes the resolution to the remote.
 */

import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { ConflictResolution } from "./types";

export interface CommitResolutionResult {
  success: boolean;
  commitSha?: string;
  pushed: boolean;
  error?: string;
}

/**
 * Applies resolved file content to the sandbox, then commits and pushes.
 *
 * @param workDir - Absolute path inside the sandbox where the repo was cloned.
 * @param prNumber - PR number used in the commit message.
 */
export async function commitResolution(
  env: Env,
  resolutions: ConflictResolution[],
  workDir: string,
  sessionId: string,
  prNumber: number
): Promise<CommitResolutionResult> {
  const logger = new Logger(env, "SandboxSDK - commitResolution");
  const tag = `[commitResolution][PR#${prNumber}]`;
  const sandbox = getSandbox(env.SANDBOX, sessionId);

  try {
    // ── 1. Write each resolved file back into the workspace ──────────────
    for (const res of resolutions) {
      if (!res.resolvedContent) continue;
      const absPath = `${workDir}/${res.path}`;
      await sandbox.writeFile(absPath, res.resolvedContent);
      logger.info(`${tag} Wrote resolved content for ${res.path} (strategy=${res.strategy})`);
    }

    // ── 2. Stage all changes ──────────────────────────────────────────────
    logger.info(`${tag} Staging resolved files...`);
    await sandbox.exec(`git -C ${workDir} add .`);

    // ── 3. Commit ─────────────────────────────────────────────────────────
    const commitMsg = `fix(colby): resolve merge conflicts for PR #${prNumber}\n\nResolved by Colby AI using ${resolveStrategySummary(resolutions)}`;
    logger.info(`${tag} Committing resolution...`);

    const commitResult = await sandbox.exec(
      `git -C ${workDir} commit -m ${JSON.stringify(commitMsg)}`
    );

    if (commitResult.exitCode !== 0) {
      // Nothing to commit — all files were already clean
      if (commitResult.stderr?.includes("nothing to commit")) {
        logger.info(`${tag} Nothing to commit — conflicts were already clean`);
        return { success: true, pushed: false };
      }
      throw new Error(`git commit failed: ${commitResult.stderr}`);
    }

    // ── 4. Extract the new commit SHA ─────────────────────────────────────
    const shaResult = await sandbox.exec(`git -C ${workDir} rev-parse HEAD`);
    const commitSha = shaResult.stdout?.trim();
    logger.info(`${tag} Commit SHA: ${commitSha}`);

    // ── 5. Push ───────────────────────────────────────────────────────────
    logger.info(`${tag} Pushing to remote...`);
    const pushResult = await sandbox.exec(`git -C ${workDir} push`);

    if (pushResult.exitCode !== 0) {
      throw new Error(`git push failed: ${pushResult.stderr}`);
    }

    logger.info(`${tag} ✓ Pushed successfully`);
    return { success: true, commitSha, pushed: true };
  } catch (error: any) {
    logger.error(`${tag} Failed: ${error.message}`);
    return { success: false, pushed: false, error: error.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveStrategySummary(resolutions: ConflictResolution[]): string {
  const counts: Record<string, number> = {};
  for (const r of resolutions) counts[r.strategy] = (counts[r.strategy] ?? 0) + 1;
  return Object.entries(counts)
    .map(([s, n]) => `${n}×${s}`)
    .join(", ");
}
