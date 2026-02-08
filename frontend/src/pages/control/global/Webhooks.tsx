
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    TableBody,
    TableCell,
    TableColumnHeader,
    TableHead,
    TableHeader,
    TableHeaderGroup,
    TableProvider,
    TableRow
} from "@/components/kibo-ui/table";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Eye, Search, ChevronLeft, ChevronRight, Webhook } from "lucide-react";
import { format } from "date-fns";

interface WebhookDelivery {
    id: string;
    delivery_id: string;
    event: string;
    action: string | null;
    created_at: string;
    payload: any;
}

const EVENT_COLORS: Record<string, string> = {
    push: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    pull_request: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    issue_comment: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    issues: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    workflow_run: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    default: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
};

const EVENT_TYPES = [
    "push",
    "pull_request",
    "issue_comment",
    "issues",
    "workflow_run",
    "workflow_job",
    "check_run",
    "create",
    "delete"
];

export default function WebhooksPage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [eventFilter, setEventFilter] = useState<string>("all");
    const [repoFilter, setRepoFilter] = useState("");
    const [search, setSearch] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ['webhooks', page, limit, eventFilter, repoFilter, search],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                ...(eventFilter !== 'all' && { event: eventFilter }),
                ...(repoFilter && { repo: repoFilter }),
                ...(search && { search })
            });
            const res = await fetch(`/api/webhooks?${params}`);
            if (!res.ok) throw new Error('Failed to fetch webhooks');
            return res.json() as Promise<{ data: WebhookDelivery[], meta: { total: number, totalPages: number } }>;
        }
    });

    const columns: ColumnDef<WebhookDelivery>[] = [
        {
            accessorKey: "created_at",
            header: ({ column }) => <TableColumnHeader column={column} title="Timestamp" />,
            cell: ({ row }) => format(new Date(row.original.created_at), "MMM d, yyyy HH:mm:ss"),
        },
        {
            accessorKey: "event",
            header: ({ column }) => <TableColumnHeader column={column} title="Event Type" />,
            cell: ({ row }) => (
                <Badge
                    variant="outline"
                    className={`border-none ${EVENT_COLORS[row.original.event] || EVENT_COLORS.default}`}
                >
                    {row.original.event}
                </Badge>
            ),
        },
        {
            id: "repo",
            header: ({ column }) => <TableColumnHeader column={column} title="Repository" />,
            cell: ({ row }) => {
                const payload = row.original.payload;
                const repoName = payload?.repository?.full_name || payload?.repository?.name || "Unknown";
                return (
                    <Badge variant="secondary" className="font-mono font-normal">
                        {repoName}
                    </Badge>
                );
            }
        },
        {
            accessorKey: "action",
            header: ({ column }) => <TableColumnHeader column={column} title="Action" />,
            cell: ({ row }) => row.original.action || "-",
        },
        {
            id: "actions",
            header: ({ column }) => <TableColumnHeader column={column} title="View" />,
            cell: ({ row }) => (
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Eye className="size-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Webhook className="size-5" />
                                {row.original.event} Delivery
                            </DialogTitle>
                            <DialogDescription>
                                Delivery ID: {row.original.delivery_id}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-auto bg-muted p-4 rounded-md">
                            <pre className="text-xs font-mono whitespace-pre-wrap">
                                {JSON.stringify(row.original.payload, null, 2)}
                            </pre>
                        </div>
                    </DialogContent>
                </Dialog>
            )
        }
    ];

    return (
        <div className="container mx-auto py-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
                    <p className="text-muted-foreground">Monitor incoming GitHub events and their payloads.</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <div className="w-[200px]">
                    <Select value={eventFilter} onValueChange={(val) => { setEventFilter(val); setPage(1); }}>
                        <SelectTrigger>
                            <SelectValue placeholder="Event Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Events</SelectItem>
                            {EVENT_TYPES.map(evt => (
                                <SelectItem key={evt} value={evt}>{evt}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-[200px]">
                    <Input
                        placeholder="Filter by Repo..."
                        value={repoFilter}
                        onChange={(e) => { setRepoFilter(e.target.value); setPage(1); }}
                    />
                </div>

                <div className="flex-1 max-w-sm">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search payload..."
                            className="pl-8"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                </div>

                <div className="w-[100px] ml-auto">
                    <Select value={limit.toString()} onValueChange={(val) => { setLimit(Number(val)); setPage(1); }}>
                        <SelectTrigger>
                            <SelectValue placeholder="Limit" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {isLoading ? (
                <div className="h-64 flex items-center justify-center">
                    <Loader2 className="animate-spin size-8 text-muted-foreground" />
                </div>
            ) : (
                <div className="border rounded-md">
                    <TableProvider columns={columns} data={data?.data || []}>
                        <TableHeader>
                            {({ headerGroup }) => (
                                <TableHeaderGroup headerGroup={headerGroup} key={headerGroup.id}>
                                    {({ header }) => <TableHead header={header} key={header.id} />}
                                </TableHeaderGroup>
                            )}
                        </TableHeader>
                        <TableBody>
                            {({ row }) => (
                                <TableRow key={row.id} row={row}>
                                    {({ cell }) => <TableCell cell={cell} key={cell.id} />}
                                </TableRow>
                            )}
                        </TableBody>
                    </TableProvider>

                    <div className="flex items-center justify-between p-4 border-t">
                        <div className="text-sm text-muted-foreground">
                            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data?.meta.total || 0)} of {data?.meta.total} entries
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                <ChevronLeft className="size-4 mr-1" />
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => p + 1)}
                                disabled={page >= (data?.meta.totalPages || 1)}
                            >
                                Next
                                <ChevronRight className="size-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
