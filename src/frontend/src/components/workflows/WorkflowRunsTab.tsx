import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WorkflowDefinition } from "@/components/workflows/catalog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WebhookDelivery {
  id: string;
  delivery_id: string;
  event: string;
  action?: string;
  payload: any; // JSON
  signature_sha256: string;
  created_at: string;
}

interface WorkflowRunsTabProps {
  workflow: WorkflowDefinition;
}

const mapTriggersToEvents = (triggers: string[]): string => {
  const events = new Set<string>();
  
  triggers.forEach(t => {
    // Handle "issues.opened" -> "issues"
    const base = t.split('.')[0].split('(')[0];
    
    // Manual mapping for some
    if (base === "pr-review" || base === "pull_request") events.add("pull_request");
    else if (base === "issue_comment") events.add("issue_comment");
    else if (base === "push") events.add("push");
    else if (base === "manual") return; // No webhook for manual
    else if (base === "chat") return; // No webhook for chat
    else events.add(base);
  });
  
  return Array.from(events).join(',');
};

export function WorkflowRunsTab({ workflow }: WorkflowRunsTabProps) {
  const [runs, setRuns] = useState<WebhookDelivery[]>([]);
  const [, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    const events = mapTriggersToEvents(workflow.triggers);
    if (!events) {
        setRuns([]);
        return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        event: events
      });
      
      const res = await fetch(`/api/webhooks?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch runs");
      
      const json = (await res.json()) as any;
      setRuns(json.data.map((d: any) => ({
        ...d,
        payload: typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload
      })));
      setTotalPages(json.meta.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setStartLoading(false);
    }
  }, [workflow.triggers, page]);

  useEffect(() => {
    setStartLoading(true);
    fetchRuns();
  }, [fetchRuns]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const stats = {
    total: runs.length, // Only current page, needs API fix for global total but fine for now
    successful: runs.length, // Placeholder
    failed: 0 // Placeholder
  };

  if (startLoading) {
      return (
          <div className="flex justify-center items-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
      )
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runs (Page)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
           {/* Placeholder stats */}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mapped Events</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-xs font-mono text-muted-foreground">
                 {mapTriggersToEvents(workflow.triggers) || "None (Manual/Chat)"}
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Repo</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Time (PST)</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                        No webhook runs found for these triggers.
                    </TableCell>
                </TableRow>
            ) : (
                runs.map((run) => (
              <>
                <TableRow 
                    key={run.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(run.id)}
                >
                  <TableCell>
                    {expandedId === run.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-medium">
                    {run.payload.repository?.full_name || "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{run.event}</Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(run.created_at), "yyyy-MM-dd hh:mm a")}
                  </TableCell>
                  <TableCell>
                    {run.payload.action || "-"}
                  </TableCell>
                </TableRow>
                {expandedId === run.id && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={5}>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold mb-2">Payload</h4>
                                <ScrollArea className="h-[300px] w-full rounded-md border p-4 bg-muted/50">
                                    <pre className="text-xs font-mono">
                                        {JSON.stringify(run.payload, null, 2)}
                                    </pre>
                                </ScrollArea>
                            </div>
                            {/* Placeholder for logs/results if we had them */}
                            <div>
                                <h4 className="font-semibold mb-2">Details</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Delivery ID</span>
                                        <span className="font-mono">{run.delivery_id}</span>
                                    </div>
                                    <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Sender</span>
                                        <span>{run.payload.sender?.login || "Unknown"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
