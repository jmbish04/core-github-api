import type { OrchestratorAgent } from "../index";
import { getAgentByName } from "agents";
import { Logger } from "@/lib/logger";

/**
 * Subscribe the OrchestratorAgent to relevant ChatRooms.
 * Listens for milestone events, Guardrail verdicts, and Jules status changes
 * to maintain a live view of all active sprints.
 */
export async function subscribeRooms(
  agent: OrchestratorAgent,
  roomIds: string[],
): Promise<void> {
  const a = agent as any;
  const logger = new Logger(a.env, "OrchestratorAgent");
  const logPrefix = "[OrchestratorAgent - subscribeRooms] ";
  for (const roomId of roomIds) {
    try {
      const chatRoom = await getAgentByName<Env>(a.env.CHAT_ROOM, roomId);
      await (chatRoom as any).subscribe("OrchestratorAgent");
      logger.info(`${logPrefix} Subscribed to ChatRoom: ${roomId}`);
    } catch (err) {
      logger.error(`${logPrefix} Failed to subscribe to room ${roomId}:`, { error: String(err) });
    }
  }
}
