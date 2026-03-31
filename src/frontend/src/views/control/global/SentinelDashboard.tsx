/**
 * @file frontend/src/views/control/global/SentinelDashboard.tsx
 * @description Global Sentinel Learning Engine dashboard with Recharts trendlines
 * showing manual corrections vs immunized rules, stats cards, and recent insights.
 *
 * Design: Brutalist Sanctuary — bg-zinc-950 canvas, bg-zinc-900 cards, NO borders.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSentinelStats,
  useSentinelInsights,
  useSentinelHealth,
} from "@/hooks/useSentinel";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LucideShieldCheck,
  LucideAlertTriangle,
  LucideActivity,
  LucideBrain,
  LucideHeart,
  LucideLoader2,
} from "lucide-react";
import { Link } from "react-router-dom";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#a1a1aa",
  low: "#52525b",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  IN_VERIFICATION: "#3b82f6",
  IMMUNIZED: "#10b981",
  REVERTED: "#ef4444",
  OBSERVED: "#a1a1aa",
};

export default function SentinelDashboard() {
  const { data: stats, isLoading: statsLoading } = useSentinelStats();
  const { data: insights, isLoading: insightsLoading } = useSentinelInsights({
    limit: 10,
  });
  const { data: health } = useSentinelHealth();

  // Build chart data from stats
  const pieData = stats
    ? Object.entries(stats.byStatus).map(([name, value]) => ({
        name,
        value,
        fill: STATUS_COLORS[name] || "#52525b",
      }))
    : [];

  const severityData = stats
    ? Object.entries(stats.bySeverity).map(([name, value]) => ({
        name,
        value,
        fill: SEVERITY_COLORS[name] || "#52525b",
      }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">
            Sentinel Learning Engine
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Architectural memory & pattern detection
          </p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <Badge
              variant="outline"
              className={`border-none ${
                health.aiGateway.reachable
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              <LucideHeart className="w-3 h-3 mr-1" />
              AI Gateway{" "}
              {health.aiGateway.reachable
                ? `${health.aiGateway.latencyMs}ms`
                : "Offline"}
            </Badge>
          )}
          <Link to="/sentinel/kanban">
            <Button
              variant="ghost"
              className="text-zinc-400 hover:text-zinc-100"
            >
              Kanban View →
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">
                  Total Insights
                </p>
                <p className="text-3xl font-bold text-zinc-50 mt-1">
                  {statsLoading ? "—" : stats?.totalInsights ?? 0}
                </p>
              </div>
              <LucideBrain className="w-8 h-8 text-zinc-700" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">
                  Immunized
                </p>
                <p className="text-3xl font-bold text-emerald-400 mt-1">
                  {statsLoading ? "—" : stats?.immunized ?? 0}
                </p>
              </div>
              <LucideShieldCheck className="w-8 h-8 text-emerald-900" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">
                  Pending Review
                </p>
                <p className="text-3xl font-bold text-amber-400 mt-1">
                  {statsLoading ? "—" : stats?.pending ?? 0}
                </p>
              </div>
              <LucideAlertTriangle className="w-8 h-8 text-amber-900" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">
                  Sessions
                </p>
                <p className="text-3xl font-bold text-zinc-50 mt-1">
                  {health?.sessions.total ?? 0}
                </p>
              </div>
              <LucideActivity className="w-8 h-8 text-zinc-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-none">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-400">
              Insights by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "none",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fafafa" }}
                    itemStyle={{ color: "#fafafa" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-zinc-600">
                No data yet
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="text-xs text-zinc-400">
                    {entry.name} ({entry.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-none">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-400">
              Severity Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {severityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={severityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#fafafa", fontSize: 12 }}
                    stroke="#3f3f46"
                  />
                  <YAxis
                    tick={{ fill: "#fafafa", fontSize: 12 }}
                    stroke="#3f3f46"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "none",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fafafa" }}
                    itemStyle={{ color: "#fafafa" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#71717a"
                    fill="#27272a"
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-zinc-600">
                No data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Insights */}
      <Card className="bg-zinc-900 border-none">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">
            Recent Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {insightsLoading ? (
            <div className="p-6 flex items-center justify-center text-zinc-500">
              <LucideLoader2 className="animate-spin w-4 h-4 mr-2" />
              Loading...
            </div>
          ) : !insights?.insights?.length ? (
            <div className="p-6 text-sm text-zinc-600">
              No insights detected yet. The Learning Agent will populate this
              after its first run.
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y divide-zinc-800/50">
                {insights.insights.map((insight: any) => (
                  <div
                    key={insight.id}
                    className="p-4 hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-none text-xs"
                            style={{
                              backgroundColor: `${SEVERITY_COLORS[insight.severity]}15`,
                              color: SEVERITY_COLORS[insight.severity],
                            }}
                          >
                            {insight.severity}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-none bg-zinc-800 text-zinc-400 text-xs"
                          >
                            {insight.category}
                          </Badge>
                          {insight.githubRepo && (
                            <span className="text-xs text-zinc-600 font-mono">
                              {insight.githubRepo}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-300 mt-1.5 line-clamp-2">
                          {insight.insightAnalysis}
                        </p>
                        {insight.suggestedImprovement && (
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                            💡 {insight.suggestedImprovement}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="border-none shrink-0 text-xs"
                        style={{
                          backgroundColor: `${STATUS_COLORS[insight.status]}15`,
                          color: STATUS_COLORS[insight.status],
                        }}
                      >
                        {insight.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
