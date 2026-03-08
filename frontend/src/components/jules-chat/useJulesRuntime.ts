/**
 * @file frontend/src/components/jules-chat/useJulesRuntime.ts
 * @description Custom hook driving the assistant-ui ExternalThread for JulesAgent
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

export interface ThinkingStep {
  step: string;
  text: string;
}

export interface JulesMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks?: Array<{ type: string; text: string; language?: string }>;
  followupPrompts?: string[];
  modelUsed?: string;
  createdAt: number;
}

export interface JulesThread {
  id: string;
  messages: JulesMessage[];
  repoUrl?: string;
}

export interface JulesRuntimeState {
  messages: JulesMessage[];
  isRunning: boolean;
  thinkingSteps: ThinkingStep[];
  followupPrompts: string[];
}

export interface JulesRuntime extends JulesRuntimeState {
  sendMessage: (text: string, modelStr?: string) => void;
  cancelRun: () => void;
}

function buildWsUrl(sessionId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/agents/jules-agent/${sessionId}`;
}

export function useJulesRuntime(
  thread: JulesThread | null,
  setThread: (t: JulesThread) => void
): JulesRuntime {
  const [messages, setMessages] = useState<JulesMessage[]>(thread?.messages ?? []);
  const [isRunning, setIsRunning] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [followupPrompts, setFollowupPrompts] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    setMessages(thread?.messages ?? []);
    setFollowupPrompts([]);
    setThinkingSteps([]);
  }, [thread?.id]);

  const ensureWs = useCallback((sessionId: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }
      const ws = new WebSocket(buildWsUrl(sessionId));
      ws.onopen = () => { wsRef.current = ws; resolve(ws); };
      ws.onerror = (e) => reject(new Error('WebSocket connection failed'));
    });
  }, []);

  const appendMessage = (threadId: string, msg: Partial<JulesMessage>) => {
      const fullMsg: JulesMessage = {
          id: msg.id || crypto.randomUUID(),
          role: msg.role || 'user',
          content: msg.content || '',
          blocks: msg.blocks,
          followupPrompts: msg.followupPrompts,
          modelUsed: msg.modelUsed,
          createdAt: Date.now()
      };

      let updatedThread: JulesThread;
      setThread(prev => {
          if (!prev || prev.id !== threadId) return prev;
          updatedThread = { ...prev, messages: [...prev.messages, fullMsg] };
          setMessages(updatedThread.messages);
          return updatedThread;
      });
  };

  const sendMessage = useCallback((text: string, modelStr?: string) => {
    if (!thread || isRunning) return;

    appendMessage(thread.id, { role: 'user', content: text });

    setIsRunning(true);
    setThinkingSteps([]);
    setFollowupPrompts([]);
    abortRef.current = false;

    // Use current state logic to compute history
    const currentMessages = [...(thread.messages || []), { role: 'user', content: text }] as JulesMessage[];
    const history = currentMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      content: m.content,
    }));

    (async () => {
      try {
        const ws = await ensureWs(thread.id);

        const payload = JSON.stringify({
          type: 'chat',
          message: text,
          history,
          context: thread.repoUrl ? { repoUrl: thread.repoUrl } : undefined,
          sessionId: thread.id,
          source: 'jules-draft',
          model: modelStr || "gemini-2.5-flash",
        });

        const handleMessage = (event: MessageEvent) => {
          if (abortRef.current) return;
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'progress') {
              setThinkingSteps((prev) => [...prev, { step: data.step, text: data.text }]);
            } else if (data.type === 'fallback_alert') {
              try {
                const { originalProvider, errorMessage } = data.payload;
                toast.warning(`Model Fallback Triggered`, {
                  description: `The primary model (${originalProvider}) failed: ${errorMessage}. Falling back.`,
                  duration: 6000,
                });
              } catch (e) {
                console.error("Failed to parse fallback alert", e);
              }
            } else if (data.type === 'result') {
              ws.removeEventListener('message', handleMessage);
              const { blocks, followupPrompts: fp, modelUsed } = data;

              const markdown = (blocks as any[]).map((b: any) => {
                if (b.type === 'section_header') return `## ${b.text}`;
                if (b.type === 'codeblock') return `\`\`\`${b.language || ''}\n${b.text}\n\`\`\``;
                return b.text;
              }).join('\n\n');

              appendMessage(thread.id, {
                role: 'assistant',
                content: markdown,
                blocks,
                followupPrompts: fp ?? [],
                modelUsed,
              });

              setFollowupPrompts(fp ?? []);
              setIsRunning(false);
              setThinkingSteps([]);
            } else if (data.type === 'error') {
              ws.removeEventListener('message', handleMessage);
              appendMessage(thread.id, {
                role: 'assistant',
                content: `⚠️ Error: ${data.text}`,
              });
              setIsRunning(false);
              setThinkingSteps([]);
            }
          } catch { /* malformed JSON — ignore */ }
        };

        ws.addEventListener('message', handleMessage);
        ws.send(payload);
      } catch (err: any) {
        // Fall back to REST
        try {
          const res = await fetch('/api/agents/jules-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              message: text,
              sessionId: thread.id,
              history,
              context: thread.repoUrl ? { repoUrl: thread.repoUrl } : undefined,
              source: 'jules-draft',
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as any;
            appendMessage(thread.id, {
              role: 'assistant',
              content: data.response ?? '',
              blocks: data.blocks ?? [],
              followupPrompts: data.followupPrompts ?? [],
              modelUsed: data.modelUsed,
            });
            setFollowupPrompts(data.followupPrompts ?? []);
          } else {
            let errText = res.statusText;
            try {
               const j = await res.json() as any;
               if (j.error) errText = j.error;
            } catch {}
            toast.error("Agent Request Failed", { description: errText || "Failed to communicate with Jules agent" });
          }
        } catch (fallbackErr: any) {
            toast.error("Network Error", { description: fallbackErr?.message || "Could not reach the AI agent endpoints." });
        }
        setIsRunning(false);
        setThinkingSteps([]);
      }
    })();
  }, [thread, isRunning, ensureWs, setThread]);

  const cancelRun = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setThinkingSteps([]);
  }, []);

  return { messages, isRunning, thinkingSteps, followupPrompts, sendMessage, cancelRun };
}
