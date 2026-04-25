import { useChat } from "@ai-sdk/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";

export function useOrchestratorRuntime(requestId?: string) {
  // Use Vercel AI SDK's useChat to stream the response from the core_orchestrator
  const chat = useChat({
    api: `/api/agents/core_orchestrator/chat`,
    body: {
      instanceName: requestId,
    },
    onError: (error) => {
      console.error(`Orchestrator stream error:`, error);
    }
  });

  // Wrap it with assistant-ui's runtime adapter
  return useChatRuntime(chat);
}
