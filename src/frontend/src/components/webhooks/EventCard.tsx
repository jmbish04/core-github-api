import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  GitPullRequest,
  AlertCircle,
  MessageSquare,
  Star,
  GitFork,
  Tag,
  Bell,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Webhook,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Types ───────────────────────────────────────────────────────

export interface StoredEvent {
  id: string;
  type: string;
  action?: string;
  title: string;
  description: string;
  url: string;
  actor: { login: string; avatar_url: string };
  timestamp: string;
  repo_name?: string;
}

export interface AutomationRunInfo {
  id: string;
  ruleId: string;
  ruleName: string;
  workflow: string;
  eventId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, React.ReactNode> = {
  push: <GitBranch className="size-4" />,
  pull_request: <GitPullRequest className="size-4" />,
  issues: <AlertCircle className="size-4" />,
  issue_comment: <MessageSquare className="size-4" />,
  star: <Star className="size-4" />,
  fork: <GitFork className="size-4" />,
  release: <Tag className="size-4" />,
  ping: <Bell className="size-4" />,
  check_run: <Play className="size-4" />,
  check_suite: <CheckCircle2 className="size-4" />,
  installation: <Webhook className="size-4" />,
};

const EVENT_COLORS: Record<string, string> = {
  push: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pull_request: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  issues: "bg-green-500/10 text-green-400 border-green-500/20",
  issue_comment: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  star: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  fork: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  release: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  check_run: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  check_suite: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  installation: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  default: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="size-3.5" />, color: "text-yellow-400", label: "Pending" },
  in_progress: { icon: <Loader2 className="size-3.5 animate-spin" />, color: "text-blue-400", label: "In Progress" },
  succeeded: { icon: <CheckCircle2 className="size-3.5" />, color: "text-green-400", label: "Succeeded" },
  failed: { icon: <XCircle className="size-3.5" />, color: "text-red-400", label: "Failed" },
};

// ── Component ───────────────────────────────────────────────────

interface EventCardProps {
  event: StoredEvent;
  automationRuns?: AutomationRunInfo[];
}

export function EventCard({ event, automationRuns = [] }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = EVENT_COLORS[event.type] || EVENT_COLORS.default;
  const icon = EVENT_ICONS[event.type] || <Webhook className="size-4" />;
  const hasAutomations = automationRuns.length > 0;

  return (
    <div className="group relative">
      {/* Main event card */}
      <div
        className={`rounded-lg border p-4 transition-colors hover:bg-accent/5 ${
          hasAutomations ? "border-b-0 rounded-b-none" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Event type icon */}
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${colorClass}`}>
            {icon}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs border ${colorClass}`}>
                {event.type}
              </Badge>
              {event.action && (
                <Badge variant="secondary" className="text-xs">
                  {event.action}
                </Badge>
              )}
              {event.repo_name && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {event.repo_name}
                </Badge>
              )}
            </div>

            <h4 className="mt-1.5 text-sm font-medium leading-tight">{event.title}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {event.description}
            </p>

            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              {event.actor.avatar_url && (
                <img
                  src={event.actor.avatar_url}
                  alt={event.actor.login}
                  className="h-4 w-4 rounded-full"
                />
              )}
              <span>{event.actor.login}</span>
              <span>
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
              </span>
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  View on GitHub
                </a>
              )}
            </div>
          </div>

          {/* Expand button when automations exist */}
          {hasAutomations && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Automation runs section */}
      {hasAutomations && (
        <div className={`border border-t-0 rounded-b-lg overflow-hidden ${expanded ? "" : "hidden"}`}>
          <div className="border-t border-dashed" />
          <div className="px-4 py-2 space-y-2 bg-accent/5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Triggered Automations
            </p>
            {automationRuns.map((run) => {
              const statusCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
              return (
                <div
                  key={run.id}
                  className="flex items-center gap-3 rounded-md border bg-background/50 px-3 py-2 text-sm"
                >
                  <span className={statusCfg.color}>{statusCfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{run.ruleName}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span className="text-muted-foreground font-mono text-xs">{run.workflow}</span>
                  </div>
                  <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>
                    {statusCfg.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
