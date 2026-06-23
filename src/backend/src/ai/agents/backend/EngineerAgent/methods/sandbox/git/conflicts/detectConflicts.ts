/**
 * @file EngineerAgent/methods/sandbox/git/conflicts/detectConflicts.ts
 * @description Step 1 of the conflict resolution pipeline.
 *              Clones the PR head branch, attempts to merge the base branch,
 *              and returns the list of files with conflict markers.
 */

import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import { getSecret } from "@/utils/secrets";
import type { ConflictFile } from "./types";

/** Marker regex for detecting unresolved conflict regions in a file. */
const CONFLICT_MARKER_RE = /^<{7} /m;

/**
 * Clones the PR head branch into the sandbox, merges the base branch, and
 * returns structured ConflictFile objects for every conflicting path.
 */
export async function detectConflicts(
  env: Env,
  opts: {
    sessionId: string;
    owner: string;
    repo: string;
    headBranch: string;
    baseBranch: string;
  }
): Promise<{ success: boolean; conflicts: ConflictFile[]; error?: string }> {
  const { sessionId, owner, repo, headBranch, baseBranch } = opts;
  const logger = new Logger(env, "SandboxSDK - detectConflicts");
  const tag = `[detectConflicts][${owner}/${repo}#${headBranch}]`;

  const sandbox = getSandbox(env.SANDBOX, sessionId);

  try {
    const token = await getSecret(env, "GITHUB_PERSONAL_ACCESS_TOKEN");
    const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    const workDir = `/workspace/conflict-resolver-${sessionId}`;

    // ── 1. Clean workspace & clone head branch ────────────────────────────
    logger.info(`${tag} Cloning ${headBranch}...`);
    await sandbox.exec(`rm -rf ${workDir} && git clone --depth=50 --branch=${headBranch} ${cloneUrl} ${workDir}`);
    await sandbox.exec(`git -C ${workDir} config user.email "colby@bot.dev"`);
    await sandbox.exec(`git -C ${workDir} config user.name "Colby Bot"`);

    // ── 2. Fetch the base branch ──────────────────────────────────────────
    logger.info(`${tag} Fetching ${baseBranch}...`);
    await sandbox.exec(`git -C ${workDir} fetch origin ${baseBranch}`);

    // ── 3. Attempt merge — we expect a non-zero exit on conflict ──────────
    logger.info(`${tag} Merging ${baseBranch} into ${headBranch}...`);
    const mergeResult = await sandbox.exec(
      `git -C ${workDir} merge --no-commit --no-ff origin/${baseBranch} || true`
    );
    logger.info(`${tag} Merge exit: stdout=${mergeResult.stdout?.slice(0, 200)}`);

    // ── 4. Find conflicting paths ─────────────────────────────────────────
    const diffResult = await sandbox.exec(
      `git -C ${workDir} diff --name-only --diff-filter=U`
    );
    const conflictPaths = diffResult.stdout
      ?.split("\n")
      .map((p: string) => p.trim())
      .filter(Boolean) ?? [];

    if (conflictPaths.length === 0) {
      logger.info(`${tag} No conflicts detected.`);
      return { success: true, conflicts: [] };
    }

    logger.info(`${tag} ${conflictPaths.length} conflicts found: ${conflictPaths.join(", ")}`);

    // ── 5. Read each conflicting file and parse conflict blocks ───────────
    const conflictFiles: ConflictFile[] = [];

    for (const filePath of conflictPaths) {
      const absPath = `${workDir}/${filePath}`;
      const readResult = await sandbox.readFile(absPath);
      const raw = readResult.content ?? "";

      if (!CONFLICT_MARKER_RE.test(raw)) {
        // Binary or already resolved — skip
        continue;
      }

      const { ours, theirs } = parseConflictBlocks(raw);

      conflictFiles.push({ path: filePath, rawConflict: raw, ours, theirs });
    }

    return { success: true, conflicts: conflictFiles };
  } catch (error: any) {
    logger.error(`${tag} Failed: ${error.message}`);
    return { success: false, conflicts: [], error: error.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Naively extracts the first ours/theirs block pair from a conflicted file.
 * For multi-conflict files this returns the concatenation of all blocks.
 */
function parseConflictBlocks(content: string): { ours: string; theirs: string } {
  const oursBlocks: string[] = [];
  const theirsBlocks: string[] = [];

  const lines = content.split("\n");
  let region: "ours" | "theirs" | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith("<<<<<<<")) {
      region = "ours";
      buffer = [];
    } else if (line.startsWith("=======") && region === "ours") {
      oursBlocks.push(buffer.join("\n"));
      buffer = [];
      region = "theirs";
    } else if (line.startsWith(">>>>>>>") && region === "theirs") {
      theirsBlocks.push(buffer.join("\n"));
      buffer = [];
      region = null;
    } else if (region !== null) {
      buffer.push(line);
    }
  }

  return {
    ours: oursBlocks.join("\n\n--- (next conflict block) ---\n\n"),
    theirs: theirsBlocks.join("\n\n--- (next conflict block) ---\n\n"),
  };
}
