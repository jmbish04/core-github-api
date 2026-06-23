/**
 * @file src/frontend/src/components/pr-center/ConflictAlert.tsx
 * @description Amber alert banner shown on PR detail pages when merge conflicts are detected.
 *              Includes a "Fix with Colby ⚡" button that triggers EngineerAgent conflict resolution
 *              and a progress sheet with real-time SSE timeline events.
 */

import { useState, useEffect, useCallback } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Zap, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface ConflictStatus {
  hasConflicts: boolean;
  headBranch: string;
  baseBranch: string;
  mergeableState: string;
}

interface TimelineEvent {
  step: string;
  status: "pending" | "active" | "completed" | "failed";
  details?: string;
}

interface ConflictAlertProps {
  owner: string;
  repo: string;
  prNumber: number;
}

const POLL_INTERVAL_MS = 15_000; // 15s

export function ConflictAlert({ owner, repo, prNumber }: ConflictAlertProps) {
  const [status, setStatus] = useState<ConflictStatus | null>(null);
  const [resolving, setResolving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // ── Poll for conflict status ──────────────────────────────────────────────
  const checkConflicts = useCallback(async () => {
    try {
      const res = await fetch(`/api/frontend/repos/${owner}/${repo}/pulls/${prNumber}/conflicts`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data);
    } catch {
      // Non-fatal
    }
  }, [owner, repo, prNumber]);

  useEffect(() => {
    checkConflicts();
    const interval = setInterval(checkConflicts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkConflicts]);

  // ── SSE subscription once operationId is available ────────────────────────
  useEffect(() => {
    if (!operationId) return;

    let es: EventSource;
    let wsTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      // Attempt to subscribe to the ops timeline SSE
      es = new EventSource(`/api/ops/${operationId}/timeline/stream`);

      es.onmessage = (e) => {
        try {
          const event: TimelineEvent = JSON.parse(e.data);
          setTimeline(prev => [...prev, event]);

          if (event.status === "completed" || event.status === "failed") {
            const allDone = event.step === "Task Finalization" || event.step === "Fatal Error";
            if (allDone) {
              setDone(true);
              setResolving(false);
              es.close();
              // Re-poll conflict status after resolution
              setTimeout(checkConflicts, 2000);
            }
          }
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        // Fallback: poll timeline via REST
        wsTimeout = setTimeout(pollTimeline, 3000);
        es.close();
      };
    };

    const pollTimeline = async () => {
      try {
        const res = await fetch(`/api/ops/${operationId}/timeline`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.events)) setTimeline(data.events);
        const last = data.events?.[data.events.length - 1];
        if (last?.step === "Task Finalization" || last?.step === "Fatal Error") {
          setDone(true);
          setResolving(false);
          checkConflicts();
        } else {
          wsTimeout = setTimeout(pollTimeline, 3000);
        }
      } catch {
        wsTimeout = setTimeout(pollTimeline, 5000);
      }
    };

    connect();
    return () => {
      es?.close();
      clearTimeout(wsTimeout);
    };
  }, [operationId, checkConflicts]);

  // ── Trigger conflict resolution ────────────────────────────────────────────
  const handleResolve = async () => {
    if (!status) return;
    setResolving(true);
    setDone(false);
    setTimeline([]);
    setSheetOpen(true);

    try {
      const res = await fetch(`/api/frontend/repos/${owner}/${repo}/pulls/${prNumber}/conflicts/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headBranch: status.headBranch, baseBranch: status.baseBranch }),
      });
      const data = await res.json();
      if (data.operationId) {
        setOperationId(data.operationId);
      }
    } catch {
      setResolving(false);
    }
  };

  if (!status?.hasConflicts) return null;

  return (
    <>
      <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertTitle className="text-amber-300 font-semibold">Merge Conflicts Detected</AlertTitle>
        <AlertDescription className="mt-1 flex items-center justify-between gap-4">
          <span className="text-amber-200/80">
            Branch <code className="text-amber-300">{status.headBranch}</code> has conflicts with{" "}
            <code className="text-amber-300">{status.baseBranch}</code>.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500 text-amber-300 hover:bg-amber-500/20 gap-1.5 shrink-0"
            onClick={handleResolve}
            disabled={resolving}
          >
            {resolving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Fix with Colby
          </Button>
        </AlertDescription>
      </Alert>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] sm:w-[540px] bg-zinc-950 border-zinc-800">
          <SheetHeader>
            <SheetTitle className="text-zinc-100 flex items-center gap-2">
              {done ? (
                resolving ? (
                  <XCircle className="h-4 w-4 text-red-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              )}
              Conflict Resolution
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {!done && !timeline.length && (
              <>
                <Progress value={undefined} className="h-1.5 bg-zinc-800" />
                <p className="text-sm text-zinc-400">Starting conflict resolver…</p>
              </>
            )}

            {timeline.map((event, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <StepIcon status={event.status} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 font-medium">{event.step}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] py-0",
                        event.status === "completed" && "border-emerald-700 text-emerald-400",
                        event.status === "failed" && "border-red-700 text-red-400",
                        event.status === "active" && "border-amber-700 text-amber-400",
                        event.status === "pending" && "border-zinc-700 text-zinc-500",
                      )}
                    >
                      {event.status}
                    </Badge>
                  </div>
                  {event.details && (
                    <p className="text-zinc-400 mt-0.5 text-xs">{event.details}</p>
                  )}
                </div>
              </div>
            ))}

            {done && (
              <div className="pt-2 text-sm text-zinc-400 border-t border-zinc-800">
                Resolution complete. Refreshing conflict status…
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function StepIcon({ status }: { status: TimelineEvent["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />;
  if (status === "active") return <Loader2 className="h-4 w-4 text-amber-400 mt-0.5 shrink-0 animate-spin" />;
  return <div className="h-4 w-4 mt-0.5 shrink-0 rounded-full border border-zinc-700" />;
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
