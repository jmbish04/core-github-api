import type { EngineerAgent } from "../index";
import type { Sprint, Subtask } from "../types";
import { emitMilestone } from "./milestones";
import { buildEnrichedPrompt } from "./enrich";

/**
 * Orchestrate a fleet of Jules sessions for a sprint.
 * Dispatches subtasks as parallel Jules sessions, monitors progress,
 * and coordinates the merge step.
 */
export async function runFleet(
  agent: EngineerAgent,
  sprint: Sprint,
  repoOwner: string,
  repoName: string,
): Promise<{ sessionIds: string[] }> {
  const sessionIds: string[] = [];
  const a = agent as any;

  for (const subtask of sprint.subtasks) {
    try {
      await emitMilestone(agent, {
        requestId: sprint.requestId,
        name: `jules:${subtask.id}`,
        status: "in_progress",
        detail: subtask.title,
        timestamp: Date.now(),
      });

      const prompt = await buildEnrichedPrompt(agent, subtask);
      const sessionId = await enrichAndStartSession(
        a.env,
        prompt,
        repoOwner,
        repoName,
        subtask,
      );

      if (sessionId) {
        sessionIds.push(sessionId);

        // Track in DO SQLite
        a.ctx.storage.sql.exec(
          `INSERT OR REPLACE INTO swe_fleet_sessions (id, request_id, role, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', strftime('%s','now'), strftime('%s','now'))`,
          sessionId,
          sprint.requestId,
          subtask.role,
        );
      }
    } catch (err) {
      console.error(`[EngineerAgent:fleet] Failed to start session for ${subtask.id}:`, err);
      await emitMilestone(agent, {
        requestId: sprint.requestId,
        name: `jules:${subtask.id}`,
        status: "failed",
        detail: `Failed to start: ${err}`,
        timestamp: Date.now(),
      });
    }
  }

  return { sessionIds };
}

/**
 * Enrich a prompt with project context and start a Jules session.
 */
async function enrichAndStartSession(
  env: Env,
  prompt: string,
  repoOwner: string,
  repoName: string,
  subtask: Subtask,
): Promise<string | null> {
  try {
    const { JulesSessionBuilder } = await import("@/services/jules/builder");
    const builder = new JulesSessionBuilder(env)
      .withPrompt(prompt)
      .withRepo(repoOwner, repoName)
      .withoutApproval();

    const session = await builder.start();
    return session.id;
  } catch (err) {
    console.error(`[EngineerAgent:jules] Failed to start Jules session for ${subtask.id}:`, err);
    return null;
  }
}
