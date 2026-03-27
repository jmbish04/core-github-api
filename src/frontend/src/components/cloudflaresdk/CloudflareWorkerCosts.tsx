import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function CloudflareWorkerCosts({ workerName }: { workerName: string }) {
    const [period, setPeriod] = useState("30d");

    const { data: costData, isLoading, error } = useQuery({
        queryKey: ["cloudflare-worker-cost", workerName, period],
        queryFn: async () => {
            const res = await fetch(`/api/cloudflare/costs/worker/${workerName}?since=${period}`);
            if (!res.ok) throw new Error("Failed to fetch worker costs");
            return res.json();
        }
    });

    const fmtCost = (val: number) => `$${val.toFixed(2)}`;
    const fmtUsage = (n: number, unit: string) => {
        if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B " + unit;
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M " + unit;
        if (n >= 1_000) return (n / 1_000).toFixed(1) + "K " + unit;
        return n.toLocaleString("en-US") + " " + unit;
    };

    if (error) {
        return <div className="text-red-500 text-sm">Failed to load cost estimates.</div>;
    }

    const worker = costData?.worker;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Estimated Costs & Usage</h3>
                <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isLoading ? (
                <Skeleton className="h-48 w-full" />
            ) : (
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Component</TableHead>
                                <TableHead>Usage Metric</TableHead>
                                <TableHead className="text-right">Estimated Cost</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell className="font-medium">Workers</TableCell>
                                <TableCell>{fmtUsage(worker.usage.workerRequests, "requests")} / {fmtUsage(worker.usage.workerCpuMs, "CPU-ms")}</TableCell>
                                <TableCell className="text-right">{fmtCost(worker.workersCost)}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">Durable Objects</TableCell>
                                <TableCell>{fmtUsage(worker.usage.doRequests, "requests")} / {fmtUsage(worker.usage.doGbSeconds, "GB-s")}</TableCell>
                                <TableCell className="text-right">{fmtCost(worker.doCost)}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">Containers</TableCell>
                                <TableCell>{(worker.usage.containerVcpuSec / 3600).toFixed(1)} vCPU-hrs</TableCell>
                                <TableCell className="text-right">{fmtCost(worker.containerCost)}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">D1 Database</TableCell>
                                <TableCell>{fmtUsage(worker.usage.d1RowsRead, "rows read")}</TableCell>
                                <TableCell className="text-right">{fmtCost(worker.d1Cost)}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">Workers KV</TableCell>
                                <TableCell>{fmtUsage(worker.usage.kvReads, "reads")} / {fmtUsage(worker.usage.kvWrites, "writes")}</TableCell>
                                <TableCell className="text-right">{fmtCost(worker.kvCost)}</TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/30">
                                <TableCell colSpan={2} className="font-bold text-right">Gross Total</TableCell>
                                <TableCell className="text-right font-bold">{fmtCost(worker.grossTotal)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
