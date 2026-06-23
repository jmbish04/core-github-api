/**
 * @file src/frontend/src/hooks/useOrchestratorStatus.ts
 * @description WebSocket hook for real-time Orchestrator Agent status.
 *              Connects to the ChatRoom for live milestone events and
 *              uses tail() for snapshot hydration on first render.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { chatRoomId } from "@/lib/chat-room-id";

export interface MilestoneEvent {
  requestId: string;
  sessionId?: string;
  name: string;
  status: "staged" | "in_progress" | "pending_review" | "blocked" | "complete" | "failed";
  detail?: string;
  timestamp: number;
}

export interface OrchestratorStatus {
  connected: boolean;
  milestones: MilestoneEvent[];
  messages: ChatMessage[];
  error: string | null;
}

interface ChatMessage {
  type: "message" | "join" | "leave";
  user: string;
  text?: string;
  timestamp: number;
  metadata?: any;
}

/**
 * Hook that connects to a ChatRoom via WebSocket and provides
 * real-time milestone events + snapshot hydration. 
 */
export function useOrchestratorStatus(requestId: string): OrchestratorStatus {
  const roomId = chatRoomId("engineer", requestId);
  const [milestones, setMilestones] = useState<MilestoneEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const processedIds = useRef(new Set<string>());

  const agent = useAgent({
    agent: "chat-room",
    name: roomId,
  });

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!agent) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg: ChatMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);

        // Check if this is a milestone event
        if (msg.metadata?.type === "milestone") {
          try {
            const milestone: MilestoneEvent = JSON.parse(msg.text || "{}");
            const key = `${milestone.requestId}:${milestone.name}`;
            if (!processedIds.current.has(key)) {
              processedIds.current.add(key);
              setMilestones((prev) => {
                // Upsert by name — replace existing milestone with same name
                const existing = prev.findIndex((m) => m.name === milestone.name);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = milestone;
                  return updated;
                }
                return [...prev, milestone];
              });
            }
          } catch {
            // Not a milestone JSON — ignore
          }
        }
      } catch {
        // Non-JSON message — ignore
      }
    };

    agent.addEventListener("message", handleMessage);
    return () => agent.removeEventListener("message", handleMessage);
  }, [agent]);

  return {
    connected: !!agent,
    milestones,
    messages,
    error,
  };
}
