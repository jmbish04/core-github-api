/**
 * @file tabs/StatsTab.tsx
 * @description Stats overview tab for the project dashboard — deployment metrics,
 * pending PRs, recent commits, and the architecture assist card.
 */

import { useNavigate } from "react-router-dom";
import { GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardTab } from "@/components/project-dashboard/tabs/DashboardTab";
import { CloudflareRepositorySpend } from "@/components/cloudflaresdk/CloudflareRepositorySpend";
import { handleGlobalLoading } from '@/lib/notification-handler';
import { handleGlobalSuccess } from "@/lib/success-handler";
import { handleGlobalError } from "@/lib/error-handler";

function asDateLabel(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

interface StatsTabProps {
  repoOwner: string;
  repoName: string;
  basePath: string;
  overview: {
    project: { name: string; lastDeployedAt: string | null };
    repository: { owner: string; name: string; fullName: string };
    cloudflare: {
      detected: boolean;
      workerName?: string;
      deployments?: Array<{ id: string; createdAt: string; source: string }>;
    };
    pendingPrs: Array<{
      number: number;
      title: string;
      author: string;
      updatedAt: string;
      url: string;
    }>;
    recentActivity: Array<{
      id: string;
      summary: string;
      actor: string;
      createdAt: string;
    }>;
  };
  onSelectEvent: (event: any) => void;
}

export function StatsTab({ repoOwner, repoName, basePath, overview, onSelectEvent }: StatsTabProps) {
  const navigate = useNavigate();

  const handleDispatch = async () => {
    const loader = handleGlobalLoading(`Dispatching to Jules...`);
    try {
      const res = await fetch(`/api/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/jules/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Standardize Worker architecture and create an actionable refactor task for Jules.",
          projectName: overview.project.name,
          repoFullName: overview.repository.fullName,
        }),
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success) throw new Error(data.error || "Failed dispatch");
      loader.dismiss();
      handleGlobalSuccess(
        "Dispatched to Jules",
        <span>
          Session tracking ID:{" "}
          <a href={`https://jules.google.com/session/${data.sessionId}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-500">
            {data.sessionId}
          </a>
        </span>
      );
    } catch (e: any) {
      loader.dismiss();
      handleGlobalError(new Error(`Dispatch Failed: ${e.message}`));
    }
  };

  return (
    <DashboardTab>
      <CloudflareRepositorySpend
        owner={overview.repository.owner}
        repo={overview.repository.name}
        workerName={overview.cloudflare.workerName || null}
        compact
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deployment Status</CardDescription>
            <CardTitle className="text-2xl">
              {overview.cloudflare.detected ? "Connected" : "Unknown"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {overview.cloudflare.deployments?.length || 0} recent deployments
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Pull Requests</CardDescription>
            <CardTitle className="text-2xl">{overview.pendingPrs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Pending review and merge work
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent Commits</CardDescription>
            <CardTitle className="text-2xl">{overview.recentActivity.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {overview.recentActivity[0]?.summary || "No recent commits available"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Architecture Assist</CardDescription>
            <CardTitle className="text-sm">Standardize Worker Arch</CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={handleDispatch}>
              Trigger Agent
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              Pending PRs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.pendingPrs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open pull requests.</p>
            ) : (
              overview.pendingPrs.slice(0, 8).map((pr) => (
                <button
                  key={pr.number}
                  onClick={() => navigate(`${basePath}/prs?pr=${pr.number}`)}
                  className="block w-full text-left rounded-md border p-3 hover:bg-muted/40 transition-colors"
                >
                  <p className="text-sm font-medium">
                    #{pr.number} {pr.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pr.author} • {asDateLabel(pr.updatedAt)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommitHorizontal className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity available.</p>
            ) : (
              overview.recentActivity.slice(0, 10).map((event) => (
                <button
                  key={event.id}
                  onClick={() => onSelectEvent(event)}
                  className="w-full text-left rounded-md border p-3 hover:bg-muted/40 transition-colors"
                >
                  <p className="text-sm font-medium">{event.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.actor} • {asDateLabel(event.createdAt)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardTab>
  );
}
