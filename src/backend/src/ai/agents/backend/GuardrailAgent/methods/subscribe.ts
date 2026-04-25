import type { GuardrailAgent } from "../index";
import { getAgentByName } from "agents";

/**
 * Subscribe this GuardrailAgent to a ChatRoom for live evaluation.
 * When code events are posted to the room, the Guardrail intercepts.
 */
export async function subscribeToChatRoom(
  agent: GuardrailAgent,
  roomId: string,
): Promise<void> {
  try {
    const a = agent as any;
    const chatRoom = await getAgentByName<Env>(a.env.CHAT_ROOM, roomId);
    await (chatRoom as any).subscribe("GuardrailAgent");
    console.log(`[GuardrailAgent] Subscribed to ChatRoom: ${roomId}`);
  } catch (err) {
    console.error(`[GuardrailAgent] Failed to subscribe to room ${roomId}:`, err);
  }
}
