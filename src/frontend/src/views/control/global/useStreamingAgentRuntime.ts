import { useChat } from "@ai-sdk/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";

export function useStreamingAgentRuntime(agentId: string, instanceName?: string) {
  // Use Vercel AI SDK's useChat to stream the response from our agent backend
  // The backend route /api/agents/:agentId/chat will handle toDataStreamResponse()
  const chat = useChat({
    api: `/api/agents/${agentId}/chat`,
    body: {
      instanceName,
    },
    // Add additional config like onError if needed
    onError: (error) => {
      console.error(`Status stream error for ${agentId}:`, error);
    }
  });

  // Wrap it with assistant-ui's runtime adapter
  return useChatRuntime(chat);
}
