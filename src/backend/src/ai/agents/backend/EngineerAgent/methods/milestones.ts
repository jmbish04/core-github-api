import type { EngineerAgent } from "../index";
import type { MilestoneEvent } from "../types";
import { getAgentByName } from "agents";

/**
 * Emit a milestone event to the ChatRoom (Lock L3).
 * This is the SINGLE path for milestone → D1 mirroring.
 * DO NOT write to D1 directly from EngineerAgent — always go through ChatRoom.post().
 */
export async function emitMilestone(
  agent: EngineerAgent,
  event: MilestoneEvent,
): Promise<void> {
  const roomId = `engineer-${event.requestId}`;
  const a = agent as any;

  // Also persist locally in EngineerAgent DO SQLite for fast reads
  a.ctx.storage.sql.exec(
    `INSERT OR REPLACE INTO swe_milestones (id, request_id, session_id, name, status, detail, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `${event.requestId}:${event.name}`,
    event.requestId,
    event.sessionId || null,
    event.name,
    event.status,
    event.detail || null,
    Math.floor(Date.now() / 1000),
  );

  // Post to ChatRoom — this handles broadcast + D1 mirror (Lock L3 single-write)
  try {
    const chatRoom = await getAgentByName<Env>(a.env.CHAT_ROOM, roomId);
    await (chatRoom as any).post(
      "EngineerAgent",
      JSON.stringify(event),
      { type: "milestone", milestone: event.name, status: event.status },
    );
  } catch (err) {
    console.error(`[EngineerAgent:milestones] Failed to post to ChatRoom ${roomId}:`, err);
  }
}
