/**
 * @file Observability.tsx
 * @description V8.1 Observability Dashboard — review SDK diagnostics, browser tool logs,
 *              and WebQueryWorker subagent results persisted in D1.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Activity,
  Globe,
  Cpu,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Radio,
  Zap,
  BarChart3,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ObservabilityEvent {
  id: number;
  channel: string;
  eventType: string;
  agent: string;
  name: string;
  payload: string | null;
  eventTimestamp: string;
  capturedAt: string;
}

interface BrowserToolLog {
  id: number;
  agentId: string;
  toolName: string;
  input: string | null;
  output: string | null;
  durationMs: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

interface WebQueryLog {
  id: number;
  executionId: string;
  facetName: string;
  query: string;
  status: string;
  resultSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface Stats {
  totalEvents: number;
  totalBrowserLogs: number;
  totalWebQueries: number;
  channelBreakdown: Array<{ channel: string; total: number }>;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function Observability() {
  const [tab, setTab] = useState("events");
  const [selectedPayload, setSelectedPayload] = useState<string | null>(null);

  // Events state
  const [eventsPage, setEventsPage] = useState(0);
  const [channelFilter, setChannelFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("");
  const limit = 30;

  // Browser state
  const [browserPage, setBrowserPage] = useState(0);

  // Web Queries state
  const [wqPage, setWqPage] = useState(0);

  // ── Stats ──────────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["observability-stats"],
    queryFn: async () => {
      const { data } = await axios.get("/api/observability/stats");
      return data;
    },
    refetchInterval: 30_000,
  });

  // ── Events ─────────────────────────────────────────────────────────
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ["observability-events", eventsPage, channelFilter, agentFilter],
    queryFn: async () => {
      const params: Record<string, string> = {
        limit: String(limit),
        offset: String(eventsPage * limit),
      };
      if (channelFilter !== "all") params.channel = channelFilter;
      if (agentFilter) params.agent = agentFilter;
      const { data } = await axios.get("/api/observability/events", { params });
      return data as { data: ObservabilityEvent[]; total: number };
    },
    refetchInterval: 15_000,
  });

  // ── Browser Logs ───────────────────────────────────────────────────
  const { data: browserData, isLoading: browserLoading } = useQuery({
    queryKey: ["observability-browser", browserPage],
    queryFn: async () => {
      const { data } = await axios.get("/api/observability/browser", {
        params: { limit, offset: browserPage * limit },
      });
      return data as { data: BrowserToolLog[]; total: number };
    },
    enabled: tab === "browser",
    refetchInterval: 30_000,
  });

  // ── Web Queries ────────────────────────────────────────────────────
  const { data: wqData, isLoading: wqLoading } = useQuery({
    queryKey: ["observability-wq", wqPage],
    queryFn: async () => {
      const { data } = await axios.get("/api/observability/web-queries", {
        params: { limit, offset: wqPage * limit },
      });
      return data as { data: WebQueryLog[]; total: number };
    },
    enabled: tab === "subagents",
    refetchInterval: 30_000,
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function channelColor(ch: string): string {
    if (ch.includes("rpc")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (ch.includes("mcp")) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    if (ch.includes("lifecycle")) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (ch.includes("state")) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (ch.includes("message")) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    if (ch.includes("schedule")) return "bg-pink-500/20 text-pink-400 border-pink-500/30";
    return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }

  function statusBadge(status: string) {
    if (status === "success") return <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">success</Badge>;
    if (status === "error") return <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">error</Badge>;
    return <Badge variant="outline" className="bg-zinc-500/20 text-zinc-400">{status}</Badge>;
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-400" />
            Observability Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            V8.1 SDK diagnostics, browser tools, and subagent logs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchEvents()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5" /> SDK Events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "…" : (stats?.totalEvents ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Browser Logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "…" : (stats?.totalBrowserLogs ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" /> Web Queries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "…" : (stats?.totalWebQueries ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {stats?.channelBreakdown?.map((cb) => (
                <Badge
                  key={cb.channel}
                  variant="outline"
                  className={`text-xs ${channelColor(cb.channel)}`}
                >
                  {cb.channel.replace("agents:", "")} ({cb.total})
                </Badge>
              ))}
              {!stats?.channelBreakdown?.length && <span className="text-xs text-muted-foreground">No data</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="events" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Events
          </TabsTrigger>
          <TabsTrigger value="browser" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Browser
          </TabsTrigger>
          <TabsTrigger value="subagents" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> Subagents
          </TabsTrigger>
        </TabsList>

        {/* ── Events Tab ──────────────────────────────────────────── */}
        <TabsContent value="events" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex gap-3">
            <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setEventsPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="agents:rpc">RPC</SelectItem>
                <SelectItem value="agents:mcp">MCP</SelectItem>
                <SelectItem value="agents:lifecycle">Lifecycle</SelectItem>
                <SelectItem value="agents:state">State</SelectItem>
                <SelectItem value="agents:message">Message</SelectItem>
                <SelectItem value="agents:schedule">Schedule</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by agent…"
              value={agentFilter}
              onChange={(e) => { setAgentFilter(e.target.value); setEventsPage(0); }}
              className="w-[200px]"
            />
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[100px]">Time</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !eventsData?.data?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No events found</TableCell></TableRow>
                ) : (
                  eventsData.data.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-mono text-xs">{ev.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${channelColor(ev.channel)}`}>
                          {ev.channel.replace("agents:", "")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ev.eventType}</TableCell>
                      <TableCell className="text-sm">{ev.agent}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{ev.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(ev.capturedAt)}</TableCell>
                      <TableCell>
                        {ev.payload && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedPayload(ev.payload)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {eventsPage * limit + 1}–{Math.min((eventsPage + 1) * limit, eventsData?.total ?? 0)} of {eventsData?.total ?? 0}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={eventsPage === 0} onClick={() => setEventsPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={(eventsPage + 1) * limit >= (eventsData?.total ?? 0)} onClick={() => setEventsPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Browser Tab ──────────────────────────────────────────── */}
        <TabsContent value="browser" className="space-y-4 mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {browserLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !browserData?.data?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No browser logs</TableCell></TableRow>
                ) : (
                  browserData.data.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">{log.id}</TableCell>
                      <TableCell className="text-sm">{log.agentId}</TableCell>
                      <TableCell className="font-mono text-xs">{log.toolName}</TableCell>
                      <TableCell>{statusBadge(log.status)}</TableCell>
                      <TableCell className="text-xs">{log.durationMs != null ? `${log.durationMs}ms` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</TableCell>
                      <TableCell>
                        {(log.input || log.output) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedPayload(JSON.stringify({ input: log.input, output: log.output, error: log.error }, null, 2))}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {browserPage * limit + 1}–{Math.min((browserPage + 1) * limit, browserData?.total ?? 0)} of {browserData?.total ?? 0}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={browserPage === 0} onClick={() => setBrowserPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={(browserPage + 1) * limit >= (browserData?.total ?? 0)} onClick={() => setBrowserPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Subagents Tab ──────────────────────────────────────────── */}
        <TabsContent value="subagents" className="space-y-4 mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Execution</TableHead>
                  <TableHead>Facet</TableHead>
                  <TableHead>Query</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {wqLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !wqData?.data?.length ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No subagent queries</TableCell></TableRow>
                ) : (
                  wqData.data.map((wq) => (
                    <TableRow key={wq.id}>
                      <TableCell className="font-mono text-xs">{wq.id}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate">{wq.executionId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-sm">{wq.facetName}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{wq.query}</TableCell>
                      <TableCell>{statusBadge(wq.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(wq.startedAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{wq.finishedAt ? timeAgo(wq.finishedAt) : "—"}</TableCell>
                      <TableCell>
                        {wq.resultSummary && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedPayload(wq.resultSummary)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {wqPage * limit + 1}–{Math.min((wqPage + 1) * limit, wqData?.total ?? 0)} of {wqData?.total ?? 0}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={wqPage === 0} onClick={() => setWqPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={(wqPage + 1) * limit >= (wqData?.total ?? 0)} onClick={() => setWqPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Payload Dialog */}
      <Dialog open={!!selectedPayload} onOpenChange={(open) => !open && setSelectedPayload(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event Payload</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all p-4 bg-zinc-900 rounded-md">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(selectedPayload ?? "{}"), null, 2);
                } catch {
                  return selectedPayload;
                }
              })()}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
