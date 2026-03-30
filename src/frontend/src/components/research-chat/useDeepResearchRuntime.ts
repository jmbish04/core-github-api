/**
 * @file useDeepResearchRuntime.ts
 * @description Hook managing the WebSocket/REST runtime for the Deep Research Agent Chat
 */

import {
    useExternalStoreRuntime,
    useExternalMessageConverter
} from "@assistant-ui/react";
import type { AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import { useCallback, useState, useEffect, useRef } from "react";
import { generateUuid } from "@/utils/common";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { getControlCenterUserId } from "@/lib/control-user";

interface DeepResearchMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    blocks?: any[];
    status?: "inflight" | "done" | "error";
    steps?: string[];
    createdAt: Date;
    followupPrompts?: string[];
}

export function useDeepResearchRuntime() {
    const [messages, setMessages] = useState<DeepResearchMessage[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionId, setSessionId] = useState<string>(() => generateUuid());
    
    // Fallback URL configs
    const isProduction = import.meta.env.PROD;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseUrl = isProduction 
      ? window.location.host 
      : 'localhost:8787'; // Wrangler dev server
      
    const getWsUrl = useCallback((sid: string) => {
        const url = new URL(`${wsProtocol}//${baseUrl}/ws?projectId=deep-research-chat-${sid}`);
        const token = getControlCenterUserId();
        if (token) {
            url.searchParams.set('token', token);
        }
        return url.toString();
    }, [baseUrl, wsProtocol]);

    const wsRef = useRef<WebSocket | null>(null);

    const connectWebSocket = useCallback((sid: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        
        try {
            const ws = new WebSocket(getWsUrl(sid));
            
            ws.onopen = () => {
                setIsConnected(true);
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'progress') {
                        setMessages(prev => {
                            const lastMsg = prev[prev.length - 1];
                            if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.status !== 'inflight') return prev;
                            
                            const updatedSteps = [...(lastMsg.steps || []), data.text];
                            return [
                                ...prev.slice(0, -1),
                                { ...lastMsg, steps: updatedSteps }
                            ];
                        });
                    } else if (data.type === 'result') {
                        setMessages(prev => {
                            const lastMsg = prev[prev.length - 1];
                            if (!lastMsg || lastMsg.role !== 'assistant') return prev;
                            
                            const flatText = data.blocks?.map((b: any) => {
                                if (b.type === 'section_header') return `### ${b.text}\n\n`;
                                if (b.type === 'codeblock') return `\`\`\`${b.language || ''}\n${b.text}\n\`\`\`\n\n`;
                                return `${b.text}\n\n`;
                            }).join('') || '';

                            return [
                                ...prev.slice(0, -1),
                                { 
                                    ...lastMsg, 
                                    content: flatText,
                                    blocks: data.blocks, 
                                    status: 'done',
                                    followupPrompts: data.followupPrompts
                                }
                            ];
                        });
                        setIsRunning(false);
                    } else if (data.type === 'error') {
                        setMessages(prev => {
                            const lastMsg = prev[prev.length - 1];
                            if (!lastMsg || lastMsg.role !== 'assistant') return prev;
                            
                            return [
                                ...prev.slice(0, -1),
                                { 
                                    ...lastMsg, 
                                    content: `Error: ${data.text}`, 
                                    status: 'error' 
                                }
                            ];
                        });
                        setIsRunning(false);
                        toast.error(`Agent Error: ${data.text}`);
                    }
                } catch (e) {
                    console.error('Failed to parse WS message', e);
                }
            };
            
            ws.onclose = () => {
                setIsConnected(false);
            };

            wsRef.current = ws;
        } catch (e) {
            console.error('WebSocket connection failed:', e);
            setIsConnected(false);
        }
    }, [getWsUrl]);

    // Send logic with REST fallback if WS is dead
    const onNew = useCallback(
        async (message: AppendMessage) => {
            const userMsg: DeepResearchMessage = {
                id: generateUuid(),
                role: "user",
                content: message.content[0]?.type === "text" ? message.content[0].text : "",
                createdAt: new Date(),
            };

            const assistantPlaceholder: DeepResearchMessage = {
                id: generateUuid(),
                role: "assistant",
                content: "",
                status: "inflight",
                steps: ["Contacting Agent..."],
                createdAt: new Date(),
            };

            setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
            setIsRunning(true);

            // Re-connect if disconnected
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                // Try REST fallback
                try {
                     const response = await api.agents['deep-research-chat'].$post({
                        json: {
                            message: userMsg.content,
                            sessionId,
                            history: messages.map(m => ({ role: m.role, content: m.content })),
                            source: 'web'
                        }
                    });
                    
                    if (response.ok) {
                         const data = await response.json();
                         setMessages(prev => {
                            const lastMsg = prev[prev.length - 1];
                            return [
                                ...prev.slice(0, -1),
                                { 
                                    ...lastMsg, 
                                    content: data.response as string,
                                    blocks: data.blocks as any[], 
                                    status: 'done',
                                    followupPrompts: (data as any).followupPrompts
                                }
                            ];
                        });
                        setIsRunning(false);
                    } else {
                         throw new Error("REST fallback API failed");
                    }
                } catch (e: any) {
                     setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        return [
                            ...prev.slice(0, -1),
                            { 
                                ...lastMsg, 
                                content: `Error: ${e.message}`, 
                                status: 'error' 
                            }
                        ];
                    });
                    setIsRunning(false);
                }
                return;
            }

            // Normal WS Send
            wsRef.current.send(JSON.stringify({
                type: 'chat',
                message: userMsg.content,
                sessionId,
                history: messages.map(m => ({ role: m.role, content: m.content })),
                source: 'web'
            }));
        },
        [messages, sessionId]
    );

    useEffect(() => {
        connectWebSocket(sessionId);
        return () => {
            wsRef.current?.close();
        };
    }, [sessionId, connectWebSocket]);

    const threadMessages = useExternalMessageConverter<DeepResearchMessage>({
        callback: (msg) => {
            const assistantState = msg.status === "inflight" ? "in_progress" 
                : msg.status === "error" ? "in_progress" // Custom error rendering
                : undefined;

            return {
                id: msg.id,
                role: msg.role,
                content: [{ type: "text", text: msg.content }],
                createdAt: msg.createdAt,
                status: assistantState,
                // Pass custom blocks and steps exactly like CloudflareDocsBetaPage does
                unstable_data: [
                    { type: 'blocks', blocks: msg.blocks },
                    { type: 'steps', steps: msg.steps },
                    { type: 'followup', prompts: msg.followupPrompts }
                ]
            } as ThreadMessageLike;
        },
        messages,
        isRunning,
    });

    const runtime = useExternalStoreRuntime({
        messages: threadMessages,
        isRunning,
        onNew,
    });

    return { 
        runtime, 
        messages, 
        setMessages, 
        sessionId,
        setSessionId,
        isConnected 
    };
}
