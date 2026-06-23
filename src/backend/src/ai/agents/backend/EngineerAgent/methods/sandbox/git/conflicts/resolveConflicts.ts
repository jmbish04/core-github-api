/**
 * @file EngineerAgent/methods/sandbox/git/conflicts/resolveConflicts.ts
 * @description Full pipeline orchestrator for merge-conflict resolution.
 *
 * Pipeline:
 *   1. detectConflicts  — clone, merge, find conflicting files
 *   2. resolveWithOpenCode — use the pre-installed opencode CLI (primary)
 *   3. resolveWithAI   — Worker-side LLM fallback for any opencode failures
 *   4. commitResolution — write resolved content, git add/commit/push
 */

import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import { getSecret } from "@/utils/secrets";
import type { ResolveConflictsOptions, ResolveConflictsResult, ConflictResolution } from "./types";
import { detectConflicts } from "./detectConflicts";
import { resolveWithOpenCode } from "./resolveWithOpenCode";
import { resolveWithAI } from "./resolveWithAI";
import { commitResolution } from "./commitResolution";

/** Timeline step shapes emitted during the run (mirroring task_runner.ts). */
type TimelineStep = { step: string; status: "pending" | "active" | "completed" | "failed"; details?: string };

/**
 * Full conflict resolution pipeline.
 * Callable directly by EngineerAgent.resolveConflicts() or from the PR-center REST route.
 */
export async function resolveConflicts(
  env: Env,
  opts: ResolveConflictsOptions
): Promise<ResolveConflictsResult> {
  const { owner, repo, prNumber, headBranch, baseBranch, skipOpencode } = opts;
  const sessionId = opts.sessionId ?? `colby-conflicts-${owner}-${repo}-${prNumber}`;
  const operationId = opts.operationId ?? sessionId;

  const logger = new Logger(env, "SandboxSDK - resolveConflicts");
  const tag = `[resolveConflicts][${owner}/${repo}#${prNumber}]`;
  const timeline: TimelineStep[] = [];

  const emit = async (step: string, status: TimelineStep["status"], details?: string) => {
    timeline.push({ step, status, details });
    logger.info(`${tag} [${status}] ${step}${details ? `: ${details}` : ""}`);

    // Best-effort SSE notification to the Worker's /api/ops/:id/timeline endpoint
    try {
      await fetch(`${env.BASE_URL}/api/ops/${operationId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Api-Key": await getSecret(env, "WORKER_API_KEY") as string },
        body: JSON.stringify({ step, status, details }),
      });
    } catch {
      // Non-fatal — client may not be listening yet
    }
  };

  const workDir = `/workspace/conflict-resolver-${sessionId}`;

  try {
    await emit("Initialization", "completed", `Conflict resolver started for PR #${prNumber}`);

    // ── STEP 1: Detect conflicts ──────────────────────────────────────────
    await emit("Detecting Conflicts", "active");
    const detection = await detectConflicts(env, { sessionId, owner, repo, headBranch, baseBranch });

    if (!detection.success) {
      await emit("Detecting Conflicts", "failed", detection.error);
      return { success: false, resolvedFiles: [], failedFiles: [], error: detection.error, timeline };
    }

    if (detection.conflicts.length === 0) {
      await emit("Detecting Conflicts", "completed", "No conflicts found — branch is already clean");
      return { success: true, resolvedFiles: [], failedFiles: [], timeline };
    }

    await emit("Detecting Conflicts", "completed", `${detection.conflicts.length} conflicting file(s): ${detection.conflicts.map(c => c.path).join(", ")}`);

    // ── STEP 2: Resolve with OpenCode (primary) ───────────────────────────
    let primaryResolutions: ConflictResolution[] = [];

    if (!skipOpencode) {
      await emit("Resolving with OpenCode", "active");
      primaryResolutions = await resolveWithOpenCode(env, detection.conflicts, workDir, sessionId);
      const opencodePassed = primaryResolutions.filter(r => r.confidence > 0);
      await emit("Resolving with OpenCode", "completed", `${opencodePassed.length}/${detection.conflicts.length} resolved`);
    }

    // ── STEP 3: AI fallback for any failures ──────────────────────────────
    const needsAI = detection.conflicts.filter((_, i) =>
      !primaryResolutions[i] || primaryResolutions[i].confidence === 0
    );

    let allResolutions: ConflictResolution[] = [...primaryResolutions];

    if (needsAI.length > 0) {
      await emit("AI Fallback Resolution", "active", `${needsAI.length} file(s) need AI resolution`);
      const aiResolutions = await resolveWithAI(env, needsAI);

      // Merge: replace zero-confidence entries with AI results
      let aiIdx = 0;
      allResolutions = allResolutions.map(r =>
        r.confidence === 0 ? (aiResolutions[aiIdx++] ?? r) : r
      );
      // Append any extras if primary count was < conflicts count (skipOpencode path)
      while (aiIdx < aiResolutions.length) {
        allResolutions.push(aiResolutions[aiIdx++]);
      }

      await emit("AI Fallback Resolution", "completed");
    }

    // ── STEP 4: Commit ────────────────────────────────────────────────────
    await emit("Committing Resolution", "active");
    const commit = await commitResolution(env, allResolutions, workDir, sessionId, prNumber);

    if (!commit.success) {
      await emit("Committing Resolution", "failed", commit.error);
      return { success: false, resolvedFiles: [], failedFiles: detection.conflicts.map(c => c.path), error: commit.error, timeline };
    }

    await emit("Committing Resolution", "completed", commit.commitSha ?? "no-op");

    // ── Cleanup workspace ─────────────────────────────────────────────────
    const sandbox = getSandbox(env.SANDBOX, sessionId);
    sandbox.exec(`rm -rf ${workDir}`).catch(() => {});

    const resolvedFiles = allResolutions.filter(r => r.confidence > 0).map(r => r.path);
    const failedFiles = allResolutions.filter(r => r.confidence === 0).map(r => r.path);

    await emit("Task Finalization", "completed", `${resolvedFiles.length} resolved, ${failedFiles.length} failed`);

    return {
      success: true,
      resolvedFiles,
      failedFiles,
      commitSha: commit.commitSha,
      timeline,
    };
  } catch (error: any) {
    logger.error(`${tag} Fatal: ${error.message}`);
    await emit("Fatal Error", "failed", error.message);
    return { success: false, resolvedFiles: [], failedFiles: [], error: error.message, timeline };
  }
}
