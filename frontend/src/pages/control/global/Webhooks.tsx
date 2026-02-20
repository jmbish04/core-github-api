
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import axios from "axios";
import { 
  Search, 
  Filter, 
  Webhook, 
  Activity, 
  AlertCircle, 
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight 
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type WebhookDelivery = {
  id: string;
  delivery_id: string;
  event: string;
  action: string | null;
  created_at: string;
  payload: any;
};

type WebhooksResponse = {
  data: WebhookDelivery[];
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

export default function WebhooksPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks", page, search, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        search,
        type: typeFilter !== "all" ? typeFilter : "",
      });
      // Use axios to ensure auth headers/cookies are sent
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

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-50 font-sans">
      <header className="border-b border-zinc-800 py-4 px-6 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Webhook className="w-6 h-6 text-purple-400" />
          <h1 className="text-xl font-bold tracking-tight">Webhooks</h1>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 space-y-6">
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

        {/* Filters & Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search payload..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 bg-zinc-900/50 border-zinc-700"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px] bg-zinc-900/50 border-zinc-700">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="pull_request">Pull Request</SelectItem>
                  <SelectItem value="issues">Issues</SelectItem>
                  <SelectItem value="workflow_run">Workflow Run</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
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

          <div className="rounded-md border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-900/50">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Event</TableHead>
                  <TableHead className="text-zinc-400">Action</TableHead>
                  <TableHead className="text-zinc-400">Delivery ID</TableHead>
                  <TableHead className="text-zinc-400">Time</TableHead>
                  <TableHead className="text-right text-zinc-400">Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                   <TableRow>
                     <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                       Loading webhooks...
                     </TableCell>
                   </TableRow>
                ) : webhooks?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                      No webhooks found.
                    </TableCell>
                  </TableRow>
                ) : (
                  webhooks?.data.map((hook) => (
                    <TableRow key={hook.id} className="border-zinc-800 hover:bg-zinc-800/50">
                      <TableCell>
                        <Badge variant="outline" className="bg-zinc-950/50 text-blue-300 border-blue-900/30">
                          {hook.event}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-300 font-medium">
                        {hook.action || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 font-mono">
                        {hook.delivery_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {format(new Date(hook.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Search className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100">
                            <DialogHeader>
                              <DialogTitle>Webhook Payload</DialogTitle>
                              <CardDescription>{hook.event} • {hook.delivery_id}</CardDescription>
                            </DialogHeader>
                            <ScrollArea className="h-[400px] w-full rounded-md border border-zinc-800 bg-zinc-900 p-4">
                              <pre className="text-xs font-mono text-zinc-300">
                                {JSON.stringify(hook.payload, null, 2)}
                              </pre>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
