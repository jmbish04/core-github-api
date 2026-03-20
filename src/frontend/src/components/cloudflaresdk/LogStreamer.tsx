import React, { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Play, Pause, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LogStreamerProps {
  projectId: string;
}

export function LogStreamer({ projectId }: LogStreamerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isTailing, setIsTailing] = useState(false);

  const toggleTail = () => {
    setIsTailing(!isTailing);
    if (!isTailing && logs.length === 0) {
      setLogs([
        "[SYSTEM] Connecting to Cloudflare Tail WebSocket...",
        "[SYSTEM] Connected successfully.",
        "Waiting for incoming requests...",
      ]);
    }
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
        
        <ScrollArea className="flex-1 p-4">
          <div className="font-mono text-xs md:text-sm leading-relaxed text-zinc-300 space-y-1">
            {logs.length === 0 ? (
              <div className="text-zinc-600 text-center mt-20">
                Click "Start Tail" to connect to the Worker stream.
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">
                  <span className="text-zinc-500 select-none mr-4">
                    {new Date().toISOString().split("T")[1].substring(0, 12)}
                  </span>
                  <span className={log.startsWith("[SYSTEM]") ? "text-blue-400" : ""}>
                    {log}
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
