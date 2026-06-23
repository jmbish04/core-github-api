import type { EngineerAgent } from "../index";
import type { Sprint } from "../types";
import { runFleet } from "./jules-orchestrator";
import { runStitchLoop, type StitchPage } from "./stitch-orchestrator";
import { emitMilestone } from "./milestones";

/**
 * Triangle coordination — runs both Jules (code) and Stitch (UI) in
 * parallel when a sprint requires both backend and frontend changes.
 */
export async function runTriangle(
  agent: EngineerAgent,
  sprint: Sprint,
  repoOwner: string,
  repoName: string,
  stitchPages: StitchPage[],
): Promise<{ julesSessionIds: string[]; stitchResult: any }> {
  await emitMilestone(agent, {
    requestId: sprint.requestId,
    name: "triangle:start",
    status: "in_progress",
    detail: `Triangle: ${sprint.subtasks.length} Jules tasks + ${stitchPages.length} Stitch pages`,
    timestamp: Date.now(),
  });

  // Run both in parallel
  const [julesResult, stitchResult] = await Promise.allSettled([
    runFleet(agent, sprint, repoOwner, repoName),
    runStitchLoop(agent, sprint.requestId, stitchPages),
  ]);

  const sessionIds = julesResult.status === "fulfilled" ? julesResult.value.sessionIds : [];
  const stitch = stitchResult.status === "fulfilled" ? stitchResult.value : { completedPages: [], totalPages: 0 };

  const allSuccess = julesResult.status === "fulfilled" && stitchResult.status === "fulfilled";

  await emitMilestone(agent, {
    requestId: sprint.requestId,
    name: "triangle:complete",
    status: allSuccess ? "complete" : "failed",
    detail: `Jules: ${sessionIds.length} sessions, Stitch: ${stitch.completedPages.length}/${stitch.totalPages} pages`,
    timestamp: Date.now(),
  });

  return { julesSessionIds: sessionIds, stitchResult: stitch };
}
