/**
 * @file frontend/src/components/cloudflare-chat/useCFDocsRuntime.ts
 * @description Custom hook that drives the assistant-ui ExternalThread with the
 * CloudflareDocsAgent WebSocket.
 *
 * WebSocket protocol (CloudflareDocsAgent.onMessage):
 *   SEND:    { type: "chat", message, history, context, sessionId }
 *   RECEIVE: { type: "progress", step, text }
 *            { type: "result",   blocks, followupPrompts, modelUsed }
 *            { type: "error",    text }
 *
 * Agent WS path (via routeAgentRequest):
 *   ws(s)://host/agents/cloudflare-docs-agent/{sessionId}
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type CFDocsThread,
  type CFDocsMessage,
  appendMessage,
  getThread,
} from '@/lib/cf-docs-thread-store';

import { handleGlobalError } from '@/lib/error-handler';
import { handleGlobalWarning } from '@/lib/notification-handler';

export interface ThinkingStep {
  step: string;
  text: string;
}

export interface CFDocsRuntimeState {
  messages: CFDocsMessage[];
  isRunning: boolean;
  thinkingSteps: ThinkingStep[];
  followupPrompts: string[];
}

export interface CFDocsRuntime extends CFDocsRuntimeState {
  sendMessage: (text: string, modelStr?: string) => void;
  cancelRun: () => void;
}

function buildWsUrl(sessionId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/agents/cloudflare-docs-agent/${sessionId}`;
}

export function useCFDocsRuntime(
  thread: CFDocsThread | null,
  setThread: (t: CFDocsThread) => void
): CFDocsRuntime {
  const [messages, setMessages] = useState<CFDocsMessage[]>(thread?.messages ?? []);
  const [isRunning, setIsRunning] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [followupPrompts, setFollowupPrompts] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef(false);

  // Sync messages when thread changes
  useEffect(() => {
    const t = thread ? getThread(thread.id) : null;
    setMessages(t?.messages ?? []);
    setFollowupPrompts([]);
    setThinkingSteps([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  const ensureWs = useCallback((sessionId: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }
      const ws = new WebSocket(buildWsUrl(sessionId));
      ws.onopen = () => { wsRef.current = ws; resolve(ws); };
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });
  }, []);

  const sendMessage = useCallback((text: string, modelStr?: string) => {
    if (!thread || isRunning) return;

    // 1. Append user message
    appendMessage(thread.id, { role: 'user', content: text });
    const freshThread = getThread(thread.id)!;
    setMessages(freshThread.messages);
    setThread(freshThread);

    setIsRunning(true);
    setThinkingSteps([]);
    setFollowupPrompts([]);
    abortRef.current = false;

    const history = freshThread.messages.slice(0, -1).map((m) => ({
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
          source: 'global-tools',
          model: modelStr || "gemini-2.5-flash",
        });

        // Route all messages for this exchange to our handlers
        const handleMessage = (event: MessageEvent) => {
          if (abortRef.current) return;
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'progress') {
              setThinkingSteps((prev) => [...prev, { step: data.step, text: data.text }]);
            } else if (data.type === 'fallback_alert') {
              try {
                const { originalProvider, errorMessage } = data.payload;
                handleGlobalWarning(
                  `Model Fallback Triggered`,
                  `Ah snap! The primary model (${originalProvider}) failed: ${errorMessage}. Falling back to Workers AI Llama.`,
                  6000
                );
              } catch (e) {
                console.error("Failed to parse fallback alert", e);
              }
            } else if (data.type === 'result') {
              ws.removeEventListener('message', handleMessage);
              const { blocks, followupPrompts: fp, modelUsed } = data;

              // Flatten blocks to markdown for storage
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

              const updated = getThread(thread.id)!;
              setMessages(updated.messages);
              setThread(updated);
              setFollowupPrompts(fp ?? []);
              setIsRunning(false);
              setThinkingSteps([]);
            } else if (data.type === 'error') {
              ws.removeEventListener('message', handleMessage);
              appendMessage(thread.id, {
                role: 'assistant',
                content: `⚠️ Error: ${data.text}`,
              });
              const updated = getThread(thread.id)!;
              setMessages(updated.messages);
              setThread(updated);
              setIsRunning(false);
              setThinkingSteps([]);
            }
          } catch (e: unknown) { 
            handleGlobalError(new Error(`[useCFDocsRuntime] WebSocket malformed JSON: ${e instanceof Error ? e.message : String(e)}`)); 
          }
        };

        ws.addEventListener('message', handleMessage);
        ws.send(payload);
      } catch (e: unknown) { 
        handleGlobalError(new Error(`[useCFDocsRuntime] WebSocket connection failed: ${e instanceof Error ? e.message : String(e)}`)); 
        // WS connection failed — fall back to REST
        try {
          const res = await fetch('/api/agents/cloudflare-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              message: text,
              sessionId: thread.id,
              history,
              context: thread.repoUrl ? { repoUrl: thread.repoUrl } : undefined,
              source: 'global-tools',
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
            const updated = getThread(thread.id)!;
            setMessages(updated.messages);
            setThread(updated);
            setFollowupPrompts(data.followupPrompts ?? []);
          } else {
            // Unpack structured backend JSON error if present
            let errText = res.statusText;
            try {
               const j = await res.json() as any;
               if (j.error) errText = j.error;
            } catch {}
            handleGlobalError(`Agent request failed. ${errText || 'Failed to communicate with Docs agent'}`);
          }
        } catch (fallbackErr: unknown) {
            const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            handleGlobalError(`Network error. ${msg || 'Could not reach the AI agent endpoints.'}`);
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
