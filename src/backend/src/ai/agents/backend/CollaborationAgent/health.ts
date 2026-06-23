/**
 * @file ChatRoom/health.ts
 * @description Health probe for ChatRoom.
 */
import type { ChatRoomHealth } from "./types";

export function buildChatRoomHealth(
  ctx: DurableObjectState,
): ChatRoomHealth {
  let messageCount = 0;
  let subscriberCount = 0;

  try {
    const msgRow = ctx.storage.sql
      .exec(`SELECT COUNT(*) as cnt FROM chat_messages`)
      .toArray();
    messageCount = (msgRow[0] as any)?.cnt ?? 0;

    const subRow = ctx.storage.sql
      .exec(`SELECT COUNT(*) as cnt FROM chat_subscribers`)
      .toArray();
    subscriberCount = (subRow[0] as any)?.cnt ?? 0;
  } catch {
    // Tables may not exist yet
  }

  return {
    status: "ok",
    agent: "ChatRoom",
    timestamp: new Date().toISOString(),
    messageCount,
    subscriberCount,
  };
}
