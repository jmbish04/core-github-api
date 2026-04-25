import type { OrchestratorAgent } from "../index";
import type { Sprint } from "../../EngineerAgent/types";
import { getAgentByName } from "agents";
import { Logger } from "@/lib/logger";

/**
 * Dispatch a sprint to the EngineerAgent for execution.
 * Uses getAgentByName for proper Agents SDK RPC.
 */
export async function dispatch(
  agent: OrchestratorAgent,
  sprint: Sprint,
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const a = agent as any;
    const engineer = await getAgentByName<Env>(
      a.env.ENGINEER_AGENT,
      `engineer-${sprint.requestId}`,
    );

    const result = await (engineer as any).assignSprint(sprint);
    return { success: true, result };
  } catch (err: any) {
    const logger = new Logger((agent as any).env, "OrchestratorAgent");
    logger.error(`Failed to dispatch sprint ${sprint.id}:`, { error: err.message });
    return { success: false, error: err.message };
  }
}
