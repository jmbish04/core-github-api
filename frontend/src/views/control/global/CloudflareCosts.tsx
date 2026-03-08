import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Cloud, Activity } from "lucide-react";

export function CloudflareCosts() {
    const [period, setPeriod] = useState("30d");

    const { data: fleetCosts, isLoading } = useQuery({
        queryKey: ["cloudflare-costs-fleet", period],
        queryFn: async () => {
            const res = await fetch(`/api/services/cloudflare/costs/fleet?since=${period}`);
            if (!res.ok) throw new Error("Failed to fetch costs");
            return res.json();
        }
    });

    const fmtCost = (val: number) => `$${val.toFixed(2)}`;

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Cloudflare Billing & Usage</h1>
                    <p className="text-muted-foreground mt-1">Fleet-wide resource estimates powered by Flareclerk</p>
                </div>
                <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Gross Total</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {isLoading ? <Skeleton className="h-8 w-24" /> : fmtCost(fleetCosts?.grossFleetTotal ?? 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Free Tier Discount</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">
                            {isLoading ? <Skeleton className="h-8 w-24" /> : `-${fmtCost(fleetCosts?.freeTierDiscount ?? 0)}`}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Net Total</CardTitle>
                        <Cloud className="h-4 w-4 opacity-80" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {isLoading ? <Skeleton className="h-8 w-24 opacity-50" /> : fmtCost(fleetCosts?.total ?? 0)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Worker Breakdown</CardTitle>
                    <CardDescription>Estimated cost distributed across all deployed scripts.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Worker</TableHead>
                                    <TableHead className="text-right">Workers Cost</TableHead>
                                    <TableHead className="text-right">Durable Objects</TableHead>
                                    <TableHead className="text-right">Containers</TableHead>
                                    <TableHead className="text-right">D1 Database</TableHead>
                                    <TableHead className="text-right">KV</TableHead>
                                    <TableHead className="text-right">Total Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fleetCosts?.workers.map((w: any) => (
                                    <TableRow key={w.name}>
                                        <TableCell className="font-mono">{w.name}</TableCell>
                                        <TableCell className="text-right">{fmtCost(w.workersCost)}</TableCell>
                                        <TableCell className="text-right">{fmtCost(w.doCost)}</TableCell>
                                        <TableCell className="text-right">{fmtCost(w.containerCost)}</TableCell>
                                        <TableCell className="text-right">{fmtCost(w.d1Cost)}</TableCell>
                                        <TableCell className="text-right">{fmtCost(w.kvCost)}</TableCell>
                                        <TableCell className="text-right font-bold">{fmtCost(w.grossTotal)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
