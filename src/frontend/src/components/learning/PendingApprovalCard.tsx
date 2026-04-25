import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";

export type Approval = {
  id: string;
  workflowId: string;
  entityType: string;
  entityId: string | null;
  proposedPayload: string;
  status: "pending" | "approved" | "rejected" | "expired";
  humanFeedback: string | null;
  createdAt: string;
  updatedAt: string;
};

type PendingApprovalCardProps = {
  approval: Approval;
  onActioned: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  expired: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export function PendingApprovalCard({ approval, onActioned }: PendingApprovalCardProps) {
  const [feedback, setFeedback] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [localStatus, setLocalStatus] = useState<Approval["status"]>(approval.status);

  const parsed = (() => {
    try {
      return JSON.parse(approval.proposedPayload) as {
        proposedPrompt: string;
        repoFullName: string;
        prNumber?: number;
      };
    } catch {
      return null;
    }
  })();

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isExpired =
    approval.status === "expired" ||
    differenceInDays(now, parseISO(approval.createdAt)) >= 7;

  const isActioned = ["approved", "rejected"].includes(localStatus);

  const handleApprove = async () => {
    setIsActioning(true);
    try {
      const res = await fetch(`/api/continuous-learning/approve/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback || undefined, userId: "user" }),
      });
      if (res.ok) {
        setLocalStatus("approved");
        onActioned();
      }
    } finally {
      setIsActioning(false);
    }
  };

  const handleReject = async () => {
    setIsActioning(true);
    try {
      const res = await fetch(`/api/continuous-learning/reject/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: feedback || "Rejected by user" }),
      });
      if (res.ok) {
        setLocalStatus("rejected");
        onActioned();
      }
    } finally {
      setIsActioning(false);
    }
  };

  const handleRetry = async () => {
    setIsActioning(true);
    try {
      const res = await fetch(`/api/continuous-learning/retry/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        onActioned();
      }
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 rounded-xl overflow-hidden">
      <CardHeader className="pb-3 border-b border-zinc-800/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-zinc-500 truncate mb-1">
              {approval.id.slice(0, 8)}
              {isExpired && localStatus === "pending" && (
                <span className="ml-2 text-red-400">· 7-day window elapsed</span>
              )}
            </p>
            <CardTitle className="text-base text-zinc-100 font-medium">
              {parsed?.repoFullName ?? "Unknown Repository"}
              {parsed?.prNumber && (
                <span className="ml-2 text-zinc-500 font-normal">#{parsed.prNumber}</span>
              )}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={STATUS_COLORS[localStatus]}>
              {localStatus}
            </Badge>
            <span className="text-xs text-zinc-600">
              {formatDistanceToNow(parseISO(approval.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Proposed Jules Prompt */}
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Proposed Jules Prompt</p>
          <pre className="bg-zinc-950 text-zinc-300 text-sm p-4 rounded-lg border border-zinc-800 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
            {parsed?.proposedPrompt ?? approval.proposedPayload}
          </pre>
        </div>

        {/* Prior feedback if any */}
        {approval.humanFeedback && (
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Operator Notes</p>
            <p className="text-sm text-zinc-400 italic">{approval.humanFeedback}</p>
          </div>
        )}

        <Separator className="bg-zinc-800" />

        {/* Actions */}
        {!isActioned && (
          <div className="space-y-3">
            <Textarea
              placeholder="Optional: Add feedback or adjustments to the Jules prompt before approving…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-300 placeholder:text-zinc-600 resize-none min-h-[80px] text-sm"
            />
            <div className="flex items-center gap-3">
              {isExpired ? (
                <Button
                  onClick={handleRetry}
                  disabled={isActioning}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
                >
                  {isActioning ? "Re-queuing…" : "Re-queue for Review"}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleApprove}
                    disabled={isActioning}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
                  >
                    {isActioning ? "Dispatching…" : "Approve & Send to Jules"}
                  </Button>
                  <Button
                    onClick={handleReject}
                    disabled={isActioning}
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white text-sm"
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Final state display */}
        {isActioned && (
          <p className="text-sm text-zinc-500 italic">
            This item has been {localStatus}. Check your inbox for the debrief email.
          </p>
        )}
        {localStatus === "expired" && (
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRetry}
              disabled={isActioning}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              {isActioning ? "Re-queuing…" : "Re-queue for Review"}
            </Button>
            <p className="text-xs text-zinc-600">Creates a fresh 7-day approval window.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
