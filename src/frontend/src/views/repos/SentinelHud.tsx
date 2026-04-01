/**
 * @file frontend/src/views/repos/SentinelHud.tsx
 * @description Repo-scoped Sentinel HUD — displays insights filtered for the
 * active workspace, with an "Upscale Repo" button to trigger JulesService.
 *
 * Design: Brutalist Sanctuary — bg-zinc-950 canvas, bg-zinc-900 cards, NO borders.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSentinelInsights, useOrchestrateUI } from "@/hooks/useSentinel";
import { useParams } from "react-router-dom";
import {
  LucideShieldCheck,
  LucideAlertTriangle,
  LucideRocket,
  LucideLoader2,
} from "lucide-react";
import { useState } from "react";

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

export default function SentinelHud() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const repoFullName = `${owner}/${repo}`;

  const { data, isLoading } = useSentinelInsights({ repo: repoFullName });
  const orchestrate = useOrchestrateUI();
  const [upscaling, setUpscaling] = useState(false);

  const insights = data?.insights || [];
  const immunized = insights.filter((i: any) => i.status === "IMMUNIZED").length;
  const pending = insights.filter((i: any) => i.status === "PENDING").length;

  const handleUpscale = async () => {
    if (!owner || !repo) return;
    setUpscaling(true);
    try {
      await orchestrate.mutateAsync({
        prompt: `Apply global architectural standards to ${repoFullName}. Review all existing components and ensure they follow the Brutalist Sanctuary design system: bg-zinc-950 canvas, bg-zinc-900 cards, no borders, monochromatic Recharts. Fix any style drift, dependency issues, or anti-patterns detected by the Sentinel Learning Engine.`,
        repoOwner: owner,
        repoName: repo,
        pageId: "upscale-result",
        routeType: "repo",
      });
    } finally {
      setUpscaling(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">
            Sentinel HUD
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5 font-mono">
            {repoFullName}
          </p>
        </div>
        <Button
          onClick={handleUpscale}
          disabled={upscaling || orchestrate.isPending}
          className="bg-emerald-600 hover:bg-emerald-500 text-white border-none"
        >
          {upscaling || orchestrate.isPending ? (
            <LucideLoader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <LucideRocket className="w-4 h-4 mr-2" />
          )}
          Upscale Repo
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">
              Total Insights
            </p>
            <p className="text-2xl font-bold text-zinc-50 mt-1">
              {isLoading ? "—" : data?.total ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6 flex items-center gap-3">
            <LucideShieldCheck className="w-6 h-6 text-emerald-500" />
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Immunized
              </p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {immunized}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-none">
          <CardContent className="pt-6 flex items-center gap-3">
            <LucideAlertTriangle className="w-6 h-6 text-amber-500" />
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Pending
              </p>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                {pending}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orchestration Status */}
      {orchestrate.isSuccess && (
        <Card className="bg-emerald-950/30 border-none">
          <CardContent className="pt-6">
            <p className="text-sm text-emerald-400">
              Upscale workflow started! Workflow ID:{" "}
              <code className="text-emerald-300 font-mono text-xs">
                {orchestrate.data?.workflowId}
              </code>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Insights List */}
      <Card className="bg-zinc-900 border-none">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">
            Repo Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 flex items-center justify-center text-zinc-500">
              <LucideLoader2 className="animate-spin w-4 h-4 mr-2" />
              Loading...
            </div>
          ) : insights.length === 0 ? (
            <div className="p-6 text-sm text-zinc-600">
              No insights for this repository yet.
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-zinc-800/50">
                {insights.map((insight: any) => (
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
                        </div>
                        <p className="text-sm text-zinc-300 mt-1.5 line-clamp-2">
                          {insight.insightAnalysis}
                        </p>
                        {insight.suggestedImprovement && (
                          <p className="text-xs text-zinc-500 mt-1">
                            {insight.suggestedImprovement}
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
