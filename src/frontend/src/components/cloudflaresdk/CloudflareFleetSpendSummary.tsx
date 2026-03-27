import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cloud, DollarSign, Server, ShieldCheck } from "lucide-react";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(value?: number | null) {
  return currency.format(value || 0);
}

export function CloudflareFleetSpendSummary() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cloudflare-dashboard-fleet-costs", "30d"],
    queryFn: async () => {
      const res = await fetch("/api/cloudflare/costs/fleet?since=30d");
      if (!res.ok) throw new Error("Failed to fetch Cloudflare fleet spend");
      return res.json();
    },
  });

  if (error) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/50 md:col-span-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Cloudflare Account Spend</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-500">
            Unable to load Cloudflare account spend.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Cloudflare Spend (30d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? <Skeleton className="h-8 w-28 bg-zinc-800" /> : formatUsd(data?.total)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Account-adjusted estimate including platform fee.</div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
            <Server className="h-4 w-4 text-orange-400" />
            Tracked Scripts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : String(data?.workers?.length || 0)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Workers discovered in this Cloudflare account.</div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            Free Tier Savings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? <Skeleton className="h-8 w-24 bg-zinc-800" /> : formatUsd(data?.freeTierDiscount)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Estimated savings from included account usage.</div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
            <Cloud className="h-4 w-4 text-blue-400" />
            Platform Fee
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? <Skeleton className="h-8 w-20 bg-zinc-800" /> : formatUsd(data?.platform)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Current fixed platform charge in the existing pricing model.</div>
        </CardContent>
      </Card>
    </div>
  );
}
