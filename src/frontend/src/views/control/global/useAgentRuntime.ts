import { useState, useCallback } from "react";
import { type ThreadMessage, type AppendMessage } from "@assistant-ui/react";
import { useExternalMessageConverter, useExternalStoreRuntime } from "@assistant-ui/react";
import { useAgent } from "agents/react";
import { handleGlobalError } from "@/lib/error-handler";
import { handleGlobalSuccess } from "@/lib/success-handler";

export function useAgentRuntime(agentId: string, instanceName: string) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // useAgent establishes WebSockets directly through Hono proxy
  const agent = useAgent({
    agent: agentId,
    name: instanceName,
    basePath: `/api/agents/${agentId}/${instanceName}`,
    onStateUpdate: () => {
      // Opt-in for sync debugging if needed
    },
    onStateUpdateError: (error) => {
      handleGlobalError(`Agent State Error: ${error}`);
    }
  });

  const onNew = useCallback(async (msg: AppendMessage) => {
    setIsRunning(true);
    
    // Convert to our generic message type
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg.content,
      createdAt: new Date(),
    } as unknown as ThreadMessage;
    
    setMessages(prev => [...prev, userMessage]);

    try {
      // We know agent.call handles RPC over WebSockets via agents SDK
      // The current backend agents implement `chat(message, history, ...)`
      const textContent = msg.content.filter(c => c.type === "text").map(c => c.text).join("\\n");
      
      const response: any = await agent.call('chat', [textContent, messages]);
      handleGlobalSuccess(`[${agentId}] Response Succeeded: ${JSON.stringify(response)}`);
      
      let replyString = "";
      if (typeof response === "string") {
        replyString = response;
      } else if (response && response.reply) {
        replyString = response.reply;
      } else if (response && response.success) {
        replyString = JSON.stringify(response.breakdown || response);
      } else {
        replyString = JSON.stringify(response);
      }

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [{ type: "text", text: replyString }],
        createdAt: new Date(),
      } as unknown as ThreadMessage;

      setMessages(prev => [...prev, assistantMessage]);
    } catch (e: any) {
      handleGlobalError(`[${agentId}] Response Failed: ${JSON.stringify(e)}`);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [{ type: "text", text: `Error: ${e.message || "Failed to reach agent"}` }],
        createdAt: new Date(),
      } as unknown as ThreadMessage]);
    } finally {
      setIsRunning(false);
    }
  }, [agent, agentId, messages]);

  // Use the assistant-ui hook for external store compatibility
  const threadMessages = useExternalMessageConverter<ThreadMessage>({
    callback: (m) => m as any,
    messages,
    isRunning,
  });

  const adapter = {
    messages: threadMessages,
    isRunning,
    onCancel: async () => { setIsRunning(false); },
    onNew,
  };

  const runtime = useExternalStoreRuntime(adapter);

  return runtime;
}
