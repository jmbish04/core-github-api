import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Github, ChevronRight, Activity, Terminal } from "lucide-react";

type PlanningRequest = {
  id: string;
  workstream: string;
  status: string;
  createdAt: string;
  r2PlanKey?: string | null;
  errorMessage?: string | null;
};

type MonitorEvent = {
  ts: string;
  type: string;
  source: string;
  status?: string;
  title: string;
  message?: string;
  files?: Array<{ path: string; additions: number; deletions: number; changeType: string }>;
};

type MonitorSnapshot = {
  requestId: string;
  status: string;
  updatedAt: string;
  recentEvents: MonitorEvent[];
};

export function PlanningCenter() {
  const [requests, setRequests] = useState<PlanningRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRequest, setActiveRequest] = useState<string | null>(null);

  // Fetch initial list
  useEffect(() => {
    async function fetchRequests() {
      try {
        const res = await api.planning.$get({ query: {} });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.requests) {
            setRequests(data.requests as PlanningRequest[]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch planning requests", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRequests();
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#0b1020] text-gray-100 overflow-hidden font-sans border-t border-white/5">
      {/* Sidebar: Request List */}
      <div className="w-80 border-r border-[#1f2937] flex flex-col bg-[#0f152b]">
        <div className="p-4 border-b border-[#1f2937]">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wider uppercase flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Planning Sessions
          </h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No planning requests found.</div>
            ) : (
              requests.map((req) => (
                <button
                  key={req.id}
                  onClick={() => setActiveRequest(req.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    activeRequest === req.id
                      ? "bg-blue-900/20 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                      : "bg-[#111827] border-transparent hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="text-xs font-mono text-gray-400 truncate pr-2">
                      {req.id.split("-")[0]}
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="text-sm font-medium text-gray-200 mb-1">
                    {req.workstream.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content: Active Request Stream */}
      <div className="flex-1 bg-[#0b1020] flex flex-col relative">
        {activeRequest ? (
          <PlanningRoom requestId={activeRequest} onBack={() => setActiveRequest(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Terminal className="w-12 h-12 mb-4 text-gray-700" />
            <p className="text-lg">Select a planning session</p>
            <p className="text-sm">Monitor agent activities and review diff stream</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  let color = "bg-gray-500/10 text-gray-400 border-gray-500/20";
  if (status === "queued") color = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  if (status === "running") color = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (status === "awaiting_plan_approval") color = "bg-purple-500/10 text-purple-400 border-purple-500/20";
  if (status === "approved") color = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (status === "implementing") color = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse";
  if (status === "completed") color = "bg-green-500/10 text-green-400 border-green-500/20";
  if (status === "failed" || status === "rejected") color = "bg-red-500/10 text-red-400 border-red-500/20";

  return (
    <Badge variant="outline" className={`text-[10px] uppercase font-mono px-1.5 py-0 border ${color}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function PlanningRoom({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snapshot?.recentEvents]);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      setConnectionStatus("connecting");
      
      const baseUrl = import.meta.env.VITE_PUBLIC_API_URL 
        ? import.meta.env.VITE_PUBLIC_API_URL.replace("http", "ws") 
        : window.location.origin.replace("http", "ws");
        
      const socket = new WebSocket(`${baseUrl}/api/planning/${requestId}/ws`);
      ws.current = socket;

      socket.onopen = () => {
        setConnectionStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "SNAPSHOT") {
            setSnapshot(data.snapshot);
          } else {
            // It's a broadcasted event update. We could selectively merge it, but for now
            // just appending to recentEvents is fine if it's broadcasting full snapshot? 
            // Wait, PlanningMonitor broadcasts the raw `event`. 
            // The snapshot represents the whole state. Let's append manually.
            setSnapshot((prev) => {
              if (!prev) return prev;
              const recentEvents = [...prev.recentEvents, data as MonitorEvent].slice(-50);
              return {
                ...prev,
                status: data.status || prev.status,
                updatedAt: data.ts || new Date().toISOString(),
                recentEvents,
              };
            });
          }
        } catch (e) {
          console.error("WebSocket message parse error", e);
        }
      };

      socket.onclose = () => {
        setConnectionStatus("disconnected");
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      ws.current?.close();
    };
  }, [requestId]);

  const handleApprove = async () => {
    try {
      await api.planning[":id"].approve.$post({
        param: { id: requestId },
        json: { decision: "approve", notes: "Approved via Planning Center UI" },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const currentStatus = snapshot?.status || "Connecting...";

  return (
    <div className="flex flex-col h-full relative">
      <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-20" />
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1f2937] bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-gray-100 font-mono tracking-tight">
                {requestId.split("-")[0]}
              </h2>
              <StatusBadge status={currentStatus} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === "connected" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-500 capitalize">{connectionStatus}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {currentStatus === "awaiting_plan_approval" && (
            <Button
              size="sm"
              onClick={handleApprove}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium tracking-wide shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve Plan
            </Button>
          )}
          {currentStatus === "completed" && (
            <Button size="sm" variant="outline" className="border-gray-700 bg-[#111827] text-gray-300">
              <Github className="w-4 h-4 mr-2" />
              View Pull Request
            </Button>
          )}
        </div>
      </div>

      {/* Event Stream */}
      <ScrollArea className="flex-1 p-4 md:p-6 bg-gradient-to-b from-[#0b1020] to-[#080b16]">
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
          {snapshot?.recentEvents?.map((evt, idx) => (
            <EventCard key={`${evt.ts}-${idx}`} event={evt} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

function EventCard({ event }: { event: MonitorEvent }) {
  const isAgent = event.source === "jules" || event.source === "agent";
  const isError = event.type === "ERROR" || event.status === "failed";
  
  return (
    <Card className={`border ${isError ? "border-red-900/50 bg-red-950/10" : "border-[#1f2937] bg-[#111827] shadow-xl"} overflow-hidden`}>
      <CardHeader className="p-4 bg-black/10 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAgent ? <Terminal className="w-4 h-4 text-purple-400" /> : <Activity className="w-4 h-4 text-blue-400" />}
            <CardTitle className="text-sm font-medium text-gray-200">{event.title}</CardTitle>
          </div>
          <span className="text-xs font-mono text-gray-500">
            {new Date(event.ts).toLocaleTimeString()}
          </span>
        </div>
      </CardHeader>
      
      {event.message && (
        <CardContent className="p-4 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
          {event.message}
        </CardContent>
      )}

      {event.files && event.files.length > 0 && (
        <div className="bg-[#0b1020] border-t border-[#1f2937] p-4">
          <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Diff Summary</h4>
          <div className="space-y-2">
            {event.files.map((f, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-black/30 border border-white/5">
                <div className="flex items-center gap-2 truncate">
                  <Badge variant="outline" className={`text-[10px] w-16 justify-center ${
                    f.changeType === 'add' ? 'border-green-500/50 text-green-400' :
                    f.changeType === 'delete' ? 'border-red-500/50 text-red-400' :
                    'border-blue-500/50 text-blue-400'
                  }`}>
                    {f.changeType || 'modify'}
                  </Badge>
                  <span className="text-xs font-mono text-gray-300 truncate">{f.path}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                  <span className="text-green-400">+{f.additions || 0}</span>
                  <span className="text-red-400">-{f.deletions || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
