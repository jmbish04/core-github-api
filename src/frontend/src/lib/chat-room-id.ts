/**
 * @file src/frontend/src/lib/chat-room-id.ts
 * @description Room ID helper with prefix enforcement.
 * All ChatRoom IDs follow the prefix-{id} pattern for namespace isolation.
 */

export type RoomPrefix = "engineer" | "orchestrator" | "guardrail" | "research" | "session";

/**
 * Build a ChatRoom ID from a prefix and identifier.
 * Enforces the prefix-{id} naming convention.
 */
export function chatRoomId(prefix: RoomPrefix, id: string): string {
  return `${prefix}-${id}`;
}

/**
 * Parse a ChatRoom ID to extract prefix and identifier.
 */
export function parseChatRoomId(roomId: string): { prefix: RoomPrefix; id: string } | null {
  const match = roomId.match(/^(engineer|orchestrator|guardrail|research|session)-(.+)$/);
  if (!match) return null;
  return { prefix: match[1] as RoomPrefix, id: match[2] };
}

/**
 * Validate that a string is a well-formed ChatRoom ID.
 */
export function isValidChatRoomId(roomId: string): boolean {
  return parseChatRoomId(roomId) !== null;
}
