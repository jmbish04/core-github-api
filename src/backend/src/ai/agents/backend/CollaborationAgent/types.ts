/**
 * @file ChatRoom/types.ts
 * @description Type definitions for the ChatRoom Agent.
 */
export type ChatMessage = {
  type: "message" | "join" | "leave";
  user: string;
  text?: string;
  timestamp: number;
  metadata?: any;
};

export type ChatRoomHealth = {
  status: string;
  agent: string;
  timestamp: string;
  messageCount: number;
  subscriberCount: number;
};
