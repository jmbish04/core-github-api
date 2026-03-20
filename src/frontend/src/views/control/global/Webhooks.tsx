
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  Search,
  Webhook,
  Activity,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  GitBranch,
  User,
  X,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type WebhookDelivery = {
  id: string;
  delivery_id: string;
  event: string;
  action: string | null;
  repo_full_name: string | null;
  created_at: string;
  payload: any;
  summary_payload: {
    action?: string;
    sender?: { login: string; avatar_url?: string; html_url?: string; type?: string };
    repository?: { full_name: string; html_url?: string; description?: string; private?: boolean };
    workflow_job?: {
      workflow_name?: string;
      name?: string;
      head_branch?: string;
      html_url?: string;
      status: string;
      conclusion?: string;
      steps?: Array<{ number: number; name: string; status: string; conclusion?: string }>;
    };
    triggered_workflows?: string[];
  } | null;
};

type WebhooksResponse = {
  data: WebhookDelivery[];
  filters: {
    repos: string[];
    actions: string[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type WebhookStats = {
  total: number;
  recent24h: number;
  topEvents: Array<{ event: string; count: number }>;
};

type AuditLog = {
  id: string;
  deliveryId: string;
  repoFullName: string;
  triggerEvent: string;
  analysisDetail: string;
  actionTaken: string;
  verificationStatus: string; // 'SUCCESS' | 'FAILURE'
  verificationReason?: string;
  createdAt: string;
};

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Format ISO date to yyyy-MM-dd hh:mm AM/PM PST */
function formatPST(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " PST";
  } catch {
    return isoString;
  }
}

/** Split "owner/repo" into parts */
function splitRepo(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  return { owner: parts[0] || "", repo: parts[1] || "" };
}

/** Event type badge colors */
function eventColor(event: string): string {
  const colors: Record<string, string> = {
    push: "bg-emerald-950/40 text-emerald-300 border-emerald-800/40",
    pull_request: "bg-purple-950/40 text-purple-300 border-purple-800/40",
    issues: "bg-amber-950/40 text-amber-300 border-amber-800/40",
    workflow_run: "bg-blue-950/40 text-blue-300 border-blue-800/40",
    workflow_job: "bg-blue-950/40 text-blue-300 border-blue-800/40",
    check_run: "bg-cyan-950/40 text-cyan-300 border-cyan-800/40",
    create: "bg-green-950/40 text-green-300 border-green-800/40",
    delete: "bg-red-950/40 text-red-300 border-red-800/40",
    star: "bg-yellow-950/40 text-yellow-300 border-yellow-800/40",
    fork: "bg-pink-950/40 text-pink-300 border-pink-800/40",
  };
  return colors[event] || "bg-zinc-950/50 text-zinc-300 border-zinc-700/40";
}

/** Workflow badge style — distinct teal/indigo treatment */
function workflowBadgeClass(): string {
  return "bg-indigo-950/50 text-indigo-300 border-indigo-700/50 hover:bg-indigo-900/60 cursor-pointer transition-colors";
}

/** Human-readable workflow display name */
function workflowLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// -------------------------------------------------------------------
// Copy Button Component
// -------------------------------------------------------------------

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 text-xs"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

// -------------------------------------------------------------------
// Actions Taken (Audit Logs) sub-component
// -------------------------------------------------------------------

function ActionsTaken({ deliveryId }: { deliveryId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["webhook-audit-logs", deliveryId],
    queryFn: async () => {
      const res = await axios.get<{ success: boolean; data: AuditLog[] }>(
        `/api/webhooks/${deliveryId}/audit-logs`
      );
      return res.data.data ?? [];
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading actions…
      </div>
    );
  }

  if (isError) {
    return <p className="text-xs text-red-400 py-1">Failed to load actions.</p>;
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-zinc-500 py-1 italic">No actions recorded for this delivery.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((log) => (
        <li key={log.id} className="flex items-start gap-2 text-sm">
          {log.verificationStatus === "SUCCESS" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          )}
          <span
            className={
              log.verificationStatus === "SUCCESS" ? "text-zinc-200" : "text-red-300"
            }
          >
            <span className="font-medium">{log.actionTaken}</span>
            {log.verificationReason && (
              <span className="text-zinc-500 ml-1 text-xs">— {log.verificationReason}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// -------------------------------------------------------------------
// Summary Tab Content
// -------------------------------------------------------------------

function SummaryView({
  summary,
  event,
  action,
  deliveryId,
}: {
  summary: WebhookDelivery["summary_payload"];
  event: string;
  action: string | null;
  deliveryId: string;
}) {
  if (!summary) {
    return <p className="text-sm text-zinc-500 p-4">No summary available for this delivery.</p>;
  }

  const triggeredWorkflows = summary.triggered_workflows ?? [];

  return (
    <div className="space-y-4 p-4">
      {/* Event & Action */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={eventColor(event)}>{event}</Badge>
        {(action || summary.action) && (
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
            {action || summary.action}
          </Badge>
        )}
      </div>

      {/* Triggered Workflows */}
      {triggeredWorkflows.length > 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-indigo-400" />
              Triggered Workflows
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {triggeredWorkflows.map((wfId) => (
              <Link
                key={wfId}
                to={`/workflows/${wfId}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${workflowBadgeClass()}`}
                title={`View ${workflowLabel(wfId)} workflow`}
              >
                <Zap className="h-3 w-3" />
                {workflowLabel(wfId)}
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions Taken (Audit Logs) */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-zinc-400" />
            Actions Taken
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActionsTaken deliveryId={deliveryId} />
        </CardContent>
      </Card>

      {/* Sender */}
      {summary.sender && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-zinc-400" />
              Sender
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-3">
              {summary.sender.avatar_url && (
                <img
                  src={summary.sender.avatar_url}
                  alt={summary.sender.login}
                  className="h-8 w-8 rounded-full border border-zinc-700"
                />
              )}
              <div>
                <p className="text-sm font-medium text-zinc-200">{summary.sender.login}</p>
                {summary.sender.type && (
                  <p className="text-xs text-zinc-500">{summary.sender.type}</p>
                )}
              </div>
              {summary.sender.html_url && (
                <a
                  href={summary.sender.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Repository */}
      {summary.repository && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-zinc-400" />
              Repository
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-medium text-zinc-200">{summary.repository.full_name}</p>
            {summary.repository.description && (
              <p className="text-xs text-zinc-500">{summary.repository.description}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              {summary.repository.private !== undefined && (
                <Badge variant="outline" className="text-xs">
                  {summary.repository.private ? "Private" : "Public"}
                </Badge>
              )}
              {summary.repository.html_url && (
                <a
                  href={summary.repository.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow Job */}
      {summary.workflow_job && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-zinc-400" />
              Workflow Job
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {summary.workflow_job.workflow_name && (
                <div>
                  <span className="text-zinc-500">Workflow:</span>{" "}
                  <span className="text-zinc-300">{summary.workflow_job.workflow_name}</span>
                </div>
              )}
              {summary.workflow_job.name && (
                <div>
                  <span className="text-zinc-500">Job:</span>{" "}
                  <span className="text-zinc-300">{summary.workflow_job.name}</span>
                </div>
              )}
              <div>
                <span className="text-zinc-500">Status:</span>{" "}
                <Badge variant="outline" className="text-xs ml-1">
                  {summary.workflow_job.status}
                </Badge>
              </div>
              {summary.workflow_job.conclusion && (
                <div>
                  <span className="text-zinc-500">Conclusion:</span>{" "}
                  <Badge
                    variant="outline"
                    className={`text-xs ml-1 ${
                      summary.workflow_job.conclusion === "success"
                        ? "text-emerald-400 border-emerald-800"
                        : summary.workflow_job.conclusion === "failure"
                        ? "text-red-400 border-red-800"
                        : ""
                    }`}
                  >
                    {summary.workflow_job.conclusion}
                  </Badge>
                </div>
              )}
              {summary.workflow_job.head_branch && (
                <div>
                  <span className="text-zinc-500">Branch:</span>{" "}
                  <span className="text-zinc-300">{summary.workflow_job.head_branch}</span>
                </div>
              )}
            </div>

            {/* Steps */}
            {summary.workflow_job.steps && summary.workflow_job.steps.length > 0 && (
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <p className="text-xs text-zinc-500 mb-1">Steps:</p>
                <div className="space-y-1">
                  {summary.workflow_job.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-600 w-4">{step.number}</span>
                      <span className="text-zinc-300 flex-1">{step.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {step.conclusion || step.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.workflow_job.html_url && (
              <a
                href={summary.workflow_job.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 pt-1"
              >
                View Job <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Webhook Payload Modal
// -------------------------------------------------------------------

function WebhookModal({
  hook,
  open,
  onClose,
  onWorkflowBadgeClick,
}: {
  hook: WebhookDelivery | null;
  open: boolean;
  onClose: () => void;
  onWorkflowBadgeClick?: (wfId: string, e: React.MouseEvent) => void;
}) {
  if (!hook) return null;

  const rawPayloadStr =
    typeof hook.payload === "string"
      ? hook.payload
      : JSON.stringify(hook.payload, null, 2);

  const summaryStr = hook.summary_payload
    ? JSON.stringify(hook.summary_payload, null, 2)
    : "";

  const triggeredWorkflows = hook.summary_payload?.triggered_workflows ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-purple-400" />
            Webhook Payload
          </DialogTitle>
          <CardDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={eventColor(hook.event)}>{hook.event}</Badge>
            {hook.action && <Badge variant="secondary" className="bg-zinc-800">{hook.action}</Badge>}
            {/* Triggered Workflow Badges in modal header */}
            {triggeredWorkflows.map((wfId) => (
              <button
                key={wfId}
                onClick={(e) => onWorkflowBadgeClick?.(wfId, e)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${workflowBadgeClass()}`}
                title={`Filter by workflow: ${workflowLabel(wfId)}`}
              >
                <Zap className="h-3 w-3" />
                {workflowLabel(wfId)}
              </button>
            ))}
            <span className="text-zinc-600">•</span>
            <span className="font-mono text-xs">{hook.delivery_id}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs">{formatPST(hook.created_at)}</span>
          </CardDescription>
        </DialogHeader>

        <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="raw">Raw Payload</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="summary" className="flex-1 min-h-0 mt-3">
            <div className="flex justify-end mb-2">
              <CopyButton text={summaryStr} label="Copy Summary" />
            </div>
            <ScrollArea className="h-[400px] w-full rounded-md border border-zinc-800 bg-zinc-900/50">
              <SummaryView
                summary={hook.summary_payload}
                event={hook.event}
                action={hook.action}
                deliveryId={hook.delivery_id}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw" className="flex-1 min-h-0 mt-3">
            <div className="flex justify-end mb-2">
              <CopyButton text={rawPayloadStr} label="Copy Raw" />
            </div>
            <ScrollArea className="h-[400px] w-full rounded-md border border-zinc-800 bg-zinc-900">
              <pre className="text-xs font-mono text-zinc-300 p-4 whitespace-pre-wrap">
                {rawPayloadStr}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------
// Main Page
// -------------------------------------------------------------------

export default function WebhooksPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [repoFilter, setRepoFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedHook, setSelectedHook] = useState<WebhookDelivery | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks", page, search, typeFilter, actionFilter, repoFilter, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (repoFilter) params.set("repo", repoFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await axios.get<WebhooksResponse>(`/api/webhooks?${params}`);
      return res.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: stats } = useQuery({
    queryKey: ["webhooks-stats"],
    queryFn: async () => {
      const res = await axios.get<WebhookStats>("/api/webhooks/stats");
      return res.data;
    },
  });

  // Collect all unique triggered workflows from the current page for the filter dropdown
  const _allWfRaw: string[] = [];
  for (const h of webhooks?.data ?? []) {
    for (const wf of h.summary_payload?.triggered_workflows ?? []) {
      _allWfRaw.push(wf);
    }
  }
  const allTriggeredWorkflows: string[] = [...new Set(_allWfRaw)].sort();

  // Client-side filter by triggered workflow
  const visibleData = (webhooks?.data ?? []).filter((hook) => {
    if (workflowFilter === "all") return true;
    return hook.summary_payload?.triggered_workflows?.includes(workflowFilter);
  });

  const handleRowClick = (hook: WebhookDelivery) => {
    setSelectedHook(hook);
    setModalOpen(true);
  };

  const handleRepoClick = (e: React.MouseEvent, repoFullName: string) => {
    e.stopPropagation();
    const { owner, repo } = splitRepo(repoFullName);
    if (owner && repo) {
      navigate(`/project/${owner}/${repo}/dashboard`);
    }
  };

  /** Clicking a workflow badge in the table opens the modal for that row */
  const handleWorkflowBadgeClick = (hook: WebhookDelivery, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedHook(hook);
    setModalOpen(true);
  };

  /** Clicking a workflow badge in the modal header can update the workflow filter */
  const handleModalWorkflowBadgeClick = (wfId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to the workflow page from the modal
    navigate(`/workflows/${wfId}`);
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setActionFilter("all");
    setRepoFilter("");
    setWorkflowFilter("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const hasActiveFilters =
    search || typeFilter !== "all" || actionFilter !== "all" ||
    repoFilter || workflowFilter !== "all" || fromDate || toDate;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-50 font-sans">
      <header className="border-b border-zinc-800 py-4 px-6 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Webhook className="w-6 h-6 text-purple-400" />
          <h1 className="text-xl font-bold tracking-tight">Webhooks</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Total Deliveries</CardTitle>
              <Activity className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total.toLocaleString() || "0"}</div>
              <p className="text-xs text-zinc-500">All time received</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Past 24 Hours</CardTitle>
              <Clock className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.recent24h.toLocaleString() || "0"}</div>
              <p className="text-xs text-zinc-500">Recent activity</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Top Event</CardTitle>
              <Webhook className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">
                {stats?.topEvents?.[0]?.event || "None"}
              </div>
              <p className="text-xs text-zinc-500">
                {stats?.topEvents?.[0]?.count || 0} occurrences
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Keyword Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search payload..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 bg-zinc-900/50 border-zinc-700"
              />
            </div>

            {/* Event Type */}
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] bg-zinc-900/50 border-zinc-700">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {(stats?.topEvents || []).map((e) => (
                  <SelectItem key={e.event} value={e.event}>
                    {e.event} ({e.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action Type */}
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] bg-zinc-900/50 border-zinc-700">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {(webhooks?.filters.actions || []).map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Workflow Filter */}
            <Select value={workflowFilter} onValueChange={(v) => setWorkflowFilter(v)}>
              <SelectTrigger className="w-[180px] bg-zinc-900/50 border-zinc-700">
                <SelectValue placeholder="Workflow triggered" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workflows</SelectItem>
                {allTriggeredWorkflows.map((wfId) => (
                  <SelectItem key={wfId} value={wfId}>
                    {workflowLabel(wfId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Repo Filter */}
            <div className="relative min-w-[180px]">
              <GitBranch className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Filter by repo..."
                value={repoFilter}
                onChange={(e) => { setRepoFilter(e.target.value); setPage(1); }}
                className="pl-8 bg-zinc-900/50 border-zinc-700"
                list="repo-suggestions"
              />
              <datalist id="repo-suggestions">
                {(webhooks?.filters.repos || []).map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            {/* Date Range */}
            <Input
              type="date"
              placeholder="From"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="w-[140px] bg-zinc-900/50 border-zinc-700 text-xs"
            />
            <Input
              type="date"
              placeholder="To"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="w-[140px] bg-zinc-900/50 border-zinc-700 text-xs"
            />

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-zinc-400">
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {workflowFilter !== "all"
                ? `${visibleData.length} filtered`
                : `${webhooks?.pagination.total.toLocaleString() || 0} results`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-zinc-400">
                Page {webhooks?.pagination.page || 1} of {webhooks?.pagination.totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (webhooks?.pagination.totalPages || 1) || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border border-zinc-800 bg-zinc-900/30 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Event</TableHead>
                <TableHead className="text-zinc-400">Action</TableHead>
                <TableHead className="text-zinc-400">Workflows Triggered</TableHead>
                <TableHead className="text-zinc-400">Repository</TableHead>
                <TableHead className="text-zinc-400">Time (PST)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                    Loading webhooks...
                  </TableCell>
                </TableRow>
              ) : visibleData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                    No webhooks found.
                  </TableCell>
                </TableRow>
              ) : (
                visibleData.map((hook) => {
                  const workflows = hook.summary_payload?.triggered_workflows ?? [];
                  return (
                    <TableRow
                      key={hook.id}
                      className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                      onClick={() => handleRowClick(hook)}
                    >
                      {/* Event badge */}
                      <TableCell>
                        <Badge variant="outline" className={eventColor(hook.event)}>
                          {hook.event}
                        </Badge>
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-zinc-300 font-medium text-sm">
                        {hook.action || "-"}
                      </TableCell>

                      {/* Triggered Workflows badges */}
                      <TableCell>
                        {workflows.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {workflows.map((wfId) => (
                              <button
                                key={wfId}
                                onClick={(e) => handleWorkflowBadgeClick(hook, e)}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${workflowBadgeClass()}`}
                                title={`${workflowLabel(wfId)} — click to open details`}
                              >
                                <Zap className="h-2.5 w-2.5" />
                                {workflowLabel(wfId)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </TableCell>

                      {/* Repo */}
                      <TableCell>
                        {hook.repo_full_name ? (
                          <button
                            onClick={(e) => handleRepoClick(e, hook.repo_full_name!)}
                            className="text-sm text-blue-400 hover:text-blue-300 hover:underline underline-offset-4 font-medium transition-colors"
                          >
                            {hook.repo_full_name}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </TableCell>

                      {/* Time */}
                      <TableCell className="text-zinc-400 text-sm font-mono">
                        {formatPST(hook.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Payload Modal */}
      <WebhookModal
        hook={selectedHook}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onWorkflowBadgeClick={handleModalWorkflowBadgeClick}
      />
    </div>
  );
}
