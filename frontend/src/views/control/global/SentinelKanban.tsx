/**
 * @file frontend/src/views/control/global/SentinelKanban.tsx
 * @description Kanban board for AI insights: Detected → Verifying → Immunized.
 *
 * Design: Brutalist Sanctuary — bg-zinc-950 canvas, bg-zinc-900 cards, NO borders.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSentinelInsights } from "@/hooks/useSentinel";
import { LucideArrowLeft, LucideLoader2 } from "lucide-react";
import { Link } from "react-router-dom";
import Cookies from "js-cookie";

const COLUMNS = [
  { key: "PENDING", label: "Detected", color: "#f59e0b" },
  { key: "IN_VERIFICATION", label: "Verifying", color: "#3b82f6" },
  { key: "IMMUNIZED", label: "Immunized", color: "#10b981" },
  { key: "OBSERVED", label: "Observed", color: "#a1a1aa" },
  { key: "REVERTED", label: "Reverted", color: "#ef4444" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#a1a1aa",
  low: "#52525b",
};

async function updateInsightStatus(insightId: string, newStatus: string) {
  const token = Cookies.get("colby_api_key");
  const baseUrl =
    import.meta.env.VITE_PUBLIC_API_URL || window.location.origin;
  // We'll use a simple PATCH approach since we have the tasks endpoint
  // For insights, we'd need a dedicated endpoint — for now log the intent
  console.log(
    `[SentinelKanban] Would update insight ${insightId} to ${newStatus}`
  );
}

export default function SentinelKanban() {
  const { data, isLoading } = useSentinelInsights({ limit: 200 });
  const insights = data?.insights || [];

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/sentinel">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-zinc-100"
            >
              <LucideArrowLeft className="w-4 h-4 mr-1" />
              Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-50 tracking-tight">
              Insights Board
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {data?.total ?? 0} total insights
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <LucideLoader2 className="animate-spin w-5 h-5 mr-2" />
          Loading insights...
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4 min-h-[600px]">
          {COLUMNS.map((col) => {
            const columnInsights = insights.filter(
              (i: any) => i.status === col.key
            );

            return (
              <div key={col.key} className="space-y-3">
                {/* Column Header */}
                <div className="flex items-center gap-2 px-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                  <span className="text-sm font-medium text-zinc-300">
                    {col.label}
                  </span>
                  <span className="text-xs text-zinc-600 ml-auto">
                    {columnInsights.length}
                  </span>
                </div>

                {/* Column Body */}
                <ScrollArea className="h-[calc(100vh-200px)]">
                  <div className="space-y-2">
                    {columnInsights.length === 0 ? (
                      <div className="p-4 text-xs text-zinc-700 text-center">
                        No items
                      </div>
                    ) : (
                      columnInsights.map((insight: any) => (
                        <Card
                          key={insight.id}
                          className="bg-zinc-900 border-none hover:bg-zinc-800/70 transition-colors cursor-pointer"
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="border-none text-[10px] px-1.5 py-0"
                                style={{
                                  backgroundColor: `${SEVERITY_COLORS[insight.severity]}15`,
                                  color: SEVERITY_COLORS[insight.severity],
                                }}
                              >
                                {insight.severity}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="border-none bg-zinc-800 text-zinc-500 text-[10px] px-1.5 py-0"
                              >
                                {insight.category}
                              </Badge>
                            </div>
                            <p className="text-xs text-zinc-300 line-clamp-3">
                              {insight.insightAnalysis}
                            </p>
                            {insight.githubRepo && (
                              <p className="text-[10px] text-zinc-600 font-mono truncate">
                                {insight.githubRepo}
                              </p>
                            )}
                            {insight.suggestedImprovement && (
                              <p className="text-[10px] text-zinc-500 line-clamp-2">
                                {insight.suggestedImprovement}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
