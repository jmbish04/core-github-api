import React, { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Play, Pause, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getBaseUrl } from "@/lib/api-client";
import { handleGlobalError } from '@/lib/error-handler';

interface LogStreamerProps {
  owner: string;
  repo: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  isSystem?: boolean;
}

export function LogStreamer({ owner, repo }: LogStreamerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isTailing, setIsTailing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Attempt auto-scroll
    const viewport = scrollViewportRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs]);

  // Handle WebSocket connection
  useEffect(() => {
    if (!isTailing) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "[SYSTEM] Tail connection closed.", isSystem: true }]);
      }
      return;
    }

    if (wsRef.current) {
      return; // Already running
    }

    let active = true;

    async function initTail() {
      setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `[SYSTEM] Requesting tail session proxy for ${owner}/${repo}...`, isSystem: true }]);
      try {
        const baseUrl = getBaseUrl();
        const wsProtocol = baseUrl.startsWith("https") ? "wss:" : "ws:";
        const host = baseUrl.replace(/^http(s)?:\/\//, "");
        const wsUrl = `${wsProtocol}//${host}/api/cloudflare/logs/tail/ws/${owner}/${repo}`;
        
        const ws = new WebSocket(wsUrl, ["edge-log-delivery-v1"]);
        wsRef.current = ws;

        ws.onopen = () => {
          setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "[SYSTEM] Connected successfully. Waiting for incoming requests...", isSystem: true }]);
        };

        ws.onerror = (err) => {
            console.error("WebSocket proxy error", err);
            if (active) {
                handleGlobalError("WebSocket connection encountered an error.");
                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `[SYSTEM] Error connecting to tail session.`, isSystem: true }]);
                setIsTailing(false);
            }
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                // Cloudflare Tail events usually have "logs" or "exceptions"
                const exceptions = message.exceptions || [];
                const logsData = message.logs || [];
                
                let combinedLogs = "";
                if (logsData.length > 0) {
                    combinedLogs = logsData.map((l: any) => l.message).join(" ");
                }
                if (exceptions.length > 0) {
                    combinedLogs += (combinedLogs ? " " : "") + exceptions.map((e: any) => e.message || e.name).join(" ");
                }
                
                const method = message.event?.request?.method || "";
                const url = message.event?.request?.url || "";
                const status = message.event?.response?.status || "";
                const outcome = message.outcome || "";
                
                const eventInfo = method || outcome ? `${method} ${url} ${status} ${outcome}`.trim() : "";
                
                if (combinedLogs || eventInfo) {
                    const finalMessage = `${eventInfo ? `[${eventInfo}] ` : ""}${combinedLogs}`;
                    setLogs(prev => [...prev, { 
                        timestamp: new Date(message.eventTimestamp || Date.now()).toISOString(), 
                        message: finalMessage.trim() || "Event log received", 
                        isSystem: false 
                    }]);
                } else if (message.eventContext) {
                    // Periodic "ping" or empty contexts
                } else {
                    setLogs(prev => [...prev, { 
                        timestamp: new Date().toISOString(), 
                        message: `Parsed message: ${Object.keys(message).join(", ")}`, 
                        isSystem: true 
                    }]);
                }
            } catch {
              
                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: String(event.data), isSystem: false }]);
            }
        };

        ws.onerror = (err) => {
          console.error("Tail WebSocket error", err);
          handleGlobalError(new Error("[LogStreamer] Tail WebSocket error"));
          setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "[SYSTEM] WebSocket error occurred.", isSystem: true }]);
        };

        ws.onclose = () => {
          if (active) {
             setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "[SYSTEM] Connection closed by remote.", isSystem: true }]);
             setIsTailing(false);
          }
        };

      } catch (err: any) {
        if (active) {
          handleGlobalError("Failed to fetch tail session: " + err.message);
          setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `[SYSTEM] Fetch Error: ${err.message}`, isSystem: true }]);
          setIsTailing(false);
        }
      }
    }

    initTail();

    return () => {
      active = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isTailing, owner, repo]);

  const toggleTail = () => {
    setIsTailing(!isTailing);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-24rem)] min-h-[400px] flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium flex items-center gap-2">
          Live Observability
          {isTailing && <Badge variant="destructive" className="animate-pulse">Live</Badge>}
        </h3>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={toggleTail}
            className={isTailing ? "border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400" : ""}
          >
            {isTailing ? (
              <><Pause className="h-4 w-4 mr-2" /> Pause</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Start Tail</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs} disabled={logs.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 rounded-md bg-zinc-950 border border-zinc-800 relative overflow-hidden flex flex-col">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center gap-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
          <span className="text-xs text-zinc-500 ml-2 font-mono">worker-tail.log</span>
        </div>
        
        <ScrollArea className="flex-1 p-4" ref={scrollViewportRef}>
          <div className="font-mono text-xs md:text-sm leading-relaxed text-zinc-300 space-y-1">
            {logs.length === 0 && !isTailing ? (
              <div className="text-zinc-600 text-center mt-20">
                Click "Start Tail" to connect to the Worker stream.
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap break-words flex gap-4">
                  <span className="text-zinc-500 select-none shrink-0 w-24">
                    {log.timestamp.split("T")[1]?.substring(0, 12)}
                  </span>
                  <span className={log.isSystem ? "text-blue-400 font-semibold" : ""}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
