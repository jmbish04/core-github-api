import React, { useEffect, useState } from "react";
import { PendingApprovalCard, type Approval } from "@/components/learning/PendingApprovalCard";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";

const STATUS_TABS = ["all", "pending", "expired", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_TABS)[number];

export function LearningQueueView() {
  const [items, setItems] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/continuous-learning/pending");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items: Approval[] };
      setItems(data.items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filtered =
    filter === "all" ? items : items.filter((i) => i.status === filter);

  const counts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === "all" ? items.length : items.filter((i) => i.status === s).length;
    return acc;
  }, {} as Record<StatusFilter, number>);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="text-zinc-400 hover:text-zinc-100 transition-colors">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-zinc-600" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-zinc-100 font-medium">HITL Queue</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50 font-mono mb-2">
            CI Healer — Approval Queue
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Review AI-proposed build fix prompts before they are dispatched to Jules. All records
            persist indefinitely — expired items can be re-queued below.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {counts[tab] > 0 && (
                <Badge variant={filter === tab ? "secondary" : "outline"} className="ml-2 px-1.5 py-0 min-w-5 justify-center">
                  {counts[tab]}
                </Badge>
              )}
            </button>
          ))}

          <button
            onClick={fetchItems}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            Loading approvals…
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-950/30 border border-red-800 p-6 text-red-400">
            Failed to load queue: {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
            <p className="text-zinc-500 text-lg mb-1">No items in this queue</p>
            <p className="text-zinc-600 text-sm">
              CI Healer will populate this queue when build failures require human review.
            </p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map((approval) => (
              <PendingApprovalCard
                key={approval.id}
                approval={approval}
                onActioned={fetchItems}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
