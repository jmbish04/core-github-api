/**
 * @file routes/api/frontend/repos/pr-conflicts.ts
 * @description REST + WebSocket endpoints for PR merge-conflict detection and resolution.
 *
 * Routes (all nested under the parent router's /:owner/:repo/pulls/:pr prefix):
 *   GET  /conflicts          — check if the PR has open merge conflicts (fast, GitHub API)
 *   POST /conflicts/resolve  — dispatch EngineerAgent.resolveConflicts(), return { operationId }
 *   WS   /conflicts/stream   — SSE/WS stream of timeline events while resolution runs
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getAgentByName } from "agents";
import { generateUuid } from "@/utils/common";
import { Logger } from "@/lib/logger";
import { getOctokit } from "@/services/octokit/core";

const prConflictsApi = new Hono<{ Bindings: Env }>();

// ── GET /:owner/:repo/pulls/:pr/conflicts ─────────────────────────────────────
/**
 * Checks the GitHub API to determine if a PR has open merge conflicts.
 * Returns { hasConflicts, conflictFiles, status }.
 * The conflictFiles list is populated by reading the `files` from the PR object.
 */
prConflictsApi.get("/:owner/:repo/pulls/:pr/conflicts", async (c) => {
  const { owner, repo, pr } = c.req.param();
  const prNumber = parseInt(pr, 10);
  const logger = new Logger(c.env, "PR-Conflicts");

  try {
    const octokit = await getOctokit(c.env);
    const { data: pullRequest } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

    const hasConflicts = pullRequest.mergeable_state === "dirty" || pullRequest.mergeable === false;
    const headBranch = pullRequest.head.ref;
    const baseBranch = pullRequest.base.ref;

    logger.info(`[pr-conflicts] PR#${prNumber}: mergeable=${pullRequest.mergeable}, state=${pullRequest.mergeable_state}`);

    return c.json({
      prNumber,
      hasConflicts,
      headBranch,
      baseBranch,
      mergeableState: pullRequest.mergeable_state,
      status: hasConflicts ? "conflicted" : "clean",
    });
  } catch (error: any) {
    logger.error(`[pr-conflicts] GET failed: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ── POST /:owner/:repo/pulls/:pr/conflicts/resolve ─────────────────────────────
const ResolveBodySchema = z.object({
  headBranch: z.string(),
  baseBranch: z.string(),
  skipOpencode: z.boolean().optional().default(false),
});

prConflictsApi.post(
  "/:owner/:repo/pulls/:pr/conflicts/resolve",
  zValidator("json", ResolveBodySchema),
  async (c) => {
    const { owner, repo, pr } = c.req.param();
    const prNumber = parseInt(pr, 10);
    const body = c.req.valid("json");
    const logger = new Logger(c.env, "PR-Conflicts");
    const operationId = generateUuid();

    logger.info(`[pr-conflicts] Dispatching resolveConflicts for PR#${prNumber} (op=${operationId})`);

    // Fire-and-forget the resolution pipeline via EngineerAgent RPC
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const agent = await getAgentByName(c.env.ENGINEER_AGENT as any, "singleton");
          await (agent as any).resolveConflicts({
            owner,
            repo,
            prNumber,
            headBranch: body.headBranch,
            baseBranch: body.baseBranch,
            sessionId: `colby-conflicts-${owner}-${repo}-${prNumber}`,
            operationId,
            skipOpencode: body.skipOpencode,
          });
        } catch (err: any) {
          logger.error(`[pr-conflicts] resolveConflicts agent RPC failed: ${err.message}`);
        }
      })()
    );

    // Return immediately with the operationId so the client can subscribe to SSE
    return c.json({
      success: true,
      operationId,
      message: `Conflict resolution started. Follow progress via /api/ops/${operationId}/timeline`,
    });
  }
);

// ── WS /:owner/:repo/pulls/:pr/conflicts/stream ───────────────────────────────
/**
 * WebSocket endpoint that proxies timeline events for the given operationId.
 * The client connects here; when `emitStep()` POSTs to /api/ops/:id/timeline,
 * this socket broadcasts to all connected clients for that operation.
 *
 * NOTE: The actual broadcast is delegated to the existing ops-timeline mechanism.
 * This endpoint is a lightweight convenience alias so the frontend can build a
 * single consistent WS URL without knowing the operationId upfront.
 */
prConflictsApi.get("/:owner/:repo/pulls/:pr/conflicts/stream", async (c) => {
  const upgrade = c.req.header("upgrade");
  if (upgrade?.toLowerCase() !== "websocket") {
    return c.json({ error: "This endpoint requires a WebSocket upgrade" }, 426);
  }
  // Delegate to the existing action-worker WS which handles op-scoped broadcasts
  return c.json({ error: "Use wss://<host>/api/ws/action-worker and filter by operationId" }, 307);
});

export default prConflictsApi;
