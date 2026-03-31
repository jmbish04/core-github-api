/**
 * @file useHoniChatRuntime.ts
 * @description Local runtime adapter for the Honi websocket agents using assistant-ui logic.
 */
import { useLocalRuntime } from "@assistant-ui/react";
import { useRef, useEffect } from "react";

export function useHoniChatRuntime(agentId: string, sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef(false);

  // Auto-connect to WS when thread changes
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/agents/${agentId}/${sessionId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [agentId, sessionId]);

  const runtime = useLocalRuntime({
    async run({ messages }) {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }

      const ws = wsRef.current;
      const latestMessage = messages[messages.length - 1];
      
      const textContent = latestMessage.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");

      abortRef.current = false;

      ws.send(JSON.stringify({
        type: "chat",
        message: textContent,
        history: messages.slice(0, -1).map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content.map((c: any) => c.text).join("")
        }))
      }));

      // Honi returns progress events and a final result. We just yield the final result.
      return new Promise<any>((resolve) => {
        const handleMessage = (event: MessageEvent) => {
          if (abortRef.current) {
            ws.removeEventListener("message", handleMessage);
            resolve({ content: [] });
            return;
          }

          try {
            const data = JSON.parse(event.data);
            if (data.type === "result") {
              ws.removeEventListener("message", handleMessage);
              resolve({
                content: [{ type: "text", text: data.text || blocksToText(data.blocks) }]
              } as any);
            } else if (data.type === "error") {
              ws.removeEventListener("message", handleMessage);
              resolve({
                content: [{ type: "text", text: `⚠️ Error: ${data.text}` }]
              } as any);
            }
          } catch {
            // ignore JSON parse errors
          }
        };

        ws.addEventListener("message", handleMessage);
      });
    }
  });

  return runtime;
}

function blocksToText(blocks?: any[]): string {
    if (!blocks) return "";
    return blocks.map((b: any) => {
        if (b.type === "codeblock") {
            const lang = b.language || "";
            return "```" + lang + "\n" + b.text + "\n```";
        }
        if (b.type === "section_header") return "## " + b.text;
        return b.text ?? "";
    }).join("\n\n");
}
