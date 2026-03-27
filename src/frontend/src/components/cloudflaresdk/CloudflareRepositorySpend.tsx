import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cloud, Database, Server } from "lucide-react";

type RepositorySpendProps = {
  owner: string;
  repo: string;
  workerName?: string | null;
  compact?: boolean;
};

type RepositorySpendResponse = {
  since: string;
  until: string;
  repository: {
    owner: string;
    repo: string;
    fullName: string;
  };
  resources: Array<{
    id: string;
    name: string;
    type: "worker" | "pages";
    githubRepo: string | null;
    url: string | null;
    summary: string | null;
    lastDeployedDate: string | null;
    spendAvailable: boolean;
    spendSource: string | null;
    reason: string | null;
    spend: {
      workersCost: number;
      doCost: number;
      containerCost: number;
      d1Cost: number;
      kvCost: number;
      grossTotal: number;
    } | null;
  }>;
  totals: {
    workers: number;
    durableObjects: number;
    containers: number;
    d1: number;
    kv: number;
    grossTotal: number;
  };
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(value?: number | null) {
  return currency.format(value || 0);
}

export function CloudflareRepositorySpend({ owner, repo, workerName, compact = false }: RepositorySpendProps) {
  const [period, setPeriod] = useState("30d");

  const { data, isLoading, error } = useQuery({
    queryKey: ["cloudflare-repository-costs", owner, repo, workerName || "", period],
    enabled: Boolean(owner && repo),
    queryFn: async () => {
      const params = new URLSearchParams({ since: period });
      if (workerName) params.set("workerName", workerName);
      const response = await fetch(
        `/api/cloudflare/costs/repository/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch repository spend");
      }
      return (await response.json()) as RepositorySpendResponse;
    },
  });

  const spendableResources = useMemo(
    () => (data?.resources || []).filter((resource) => resource.spendAvailable),
    [data?.resources],
  );

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cloudflare Spend</CardTitle>
          <CardDescription>Unable to load Cloudflare spend for this repository.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">Cloudflare Spend</h3>
          <p className="text-sm text-muted-foreground">
            Gross estimated spend across linked Workers, Pages projects, and bound services.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={`grid gap-4 ${compact ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-4"}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross Estimated Spend</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? <Skeleton className="h-8 w-28" /> : formatUsd(data?.totals.grossTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Account free-tier allocation is not prorated at repo level.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compute</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Server className="h-5 w-5 text-orange-500" />
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatUsd((data?.totals.workers || 0) + (data?.totals.containers || 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Workers and Containers
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>State & Storage</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Database className="h-5 w-5 text-emerald-500" />
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatUsd((data?.totals.durableObjects || 0) + (data?.totals.d1 || 0) + (data?.totals.kv || 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Durable Objects, D1, and KV
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Linked Resources</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Cloud className="h-5 w-5 text-blue-500" />
              {isLoading ? <Skeleton className="h-8 w-16" /> : String(data?.resources.length || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {isLoading ? "Loading linked apps..." : `${spendableResources.length} with priced spend`}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Linked Cloudflare Resources</CardTitle>
          <CardDescription>
            Pages projects are included when linked to this repo. Spend is shown when a directly priced Worker script is discoverable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : !data?.resources.length ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No linked Cloudflare Worker or Pages application was found for this repository.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Workers</TableHead>
                  <TableHead className="text-right">State</TableHead>
                  <TableHead className="text-right">Storage</TableHead>
                  <TableHead className="text-right">Gross Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.resources.map((resource) => {
                  const spend = resource.spend;
                  const stateCost = (spend?.doCost || 0) + (spend?.containerCost || 0);
                  const storageCost = (spend?.d1Cost || 0) + (spend?.kvCost || 0);

                  return (
                    <TableRow key={resource.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{resource.name}</div>
                          {resource.reason && <div className="text-xs text-muted-foreground">{resource.reason}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {resource.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {spend ? formatUsd(spend.workersCost) : <span className="text-muted-foreground">N/A</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {spend ? formatUsd(stateCost) : <span className="text-muted-foreground">N/A</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {spend ? formatUsd(storageCost) : <span className="text-muted-foreground">N/A</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {spend ? (
                          formatUsd(spend.grossTotal)
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
