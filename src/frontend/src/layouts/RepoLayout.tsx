import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Outlet, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  FolderGit2,
  Github,
  Loader2,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { handleGlobalSuccess } from "@/lib/success-handler";
import { handleGlobalError } from "@/lib/error-handler";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pushRecentProject, removeRecentProject } from "@/lib/project-recents";
import { cn } from "@/lib/utils";
import { ProjectDashboardLayout } from "@/components/project-dashboard/ProjectDashboardLayout";
import { RepoActionsDialog } from "@/components/repo-actions/RepoActionsDialog";

// ── Types ───────────────────────────────────────────────────────────────────

export type ProjectLookupResponse = {
  success: boolean;
  id?: string;        // API may return `id` instead of `projectId` (legacy shape)
  projectId: string;
  repoId: string;
  projectName: string;
  projectStatus: string;
  repoOwner: string;
  repoName: string;
};

export type OverviewEntry = {
  path: string;
  type: "blob" | "tree";
  size: number;
};

export type OverviewResponse = {
  success: boolean;
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    owner: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    lastDeployedAt: string | null;
  };
  repository: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    url: string | null;
    description: string | null;
    infrastructure: string | null;
    defaultBranch: string;
  };
  tags: string[];
  codebase: {
    defaultBranch: string;
    entries: OverviewEntry[];
  };
  pendingPrs: Array<{
    number: number;
    title: string;
    state: string;
    draft: boolean;
    author: string;
    url: string;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    actor: string;
    createdAt: string;
    summary: string;
    url: string;
    rawPayload: any;
  }>;
  cloudflare: {
    detected: boolean;
    workerName?: string;
    wranglerFile?: string | null;
    bindings?: Record<string, string[] | null>;
    deployments?: Array<{ id: string; createdAt: string; source: string }>;
    dashboardUrl?: string;
  };
};

export type ProjectDetailsResponse = {
  success: boolean;
  project: { id: string; name: string };
  phases: Array<{
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    status: string | null;
  }>;
};

export type TaskListResponse = {
  success: boolean;
  tasks: Array<{ id: string; title: string; status: string; phaseId?: string | null }>;
};

type FavoriteProject = { repoOwner: string; repoName: string };

// ── Constants ───────────────────────────────────────────────────────────────

const TAG_STYLES: Record<string, string> = {
  Python: "border-blue-500/50 bg-blue-500/15 text-blue-300",
  Workers: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  Cloudflare: "border-cyan-500/50 bg-cyan-500/15 text-cyan-300",
  TypeScript: "border-sky-500/50 bg-sky-500/15 text-sky-300",
  JavaScript: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  React: "border-indigo-500/50 bg-indigo-500/15 text-indigo-300",
  Astro: "border-purple-500/50 bg-purple-500/15 text-purple-300",
  "Node.js": "border-lime-500/50 bg-lime-500/15 text-lime-300",
  Docker: "border-zinc-500/50 bg-zinc-500/15 text-zinc-300",
  Drizzle: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  "GitHub Actions": "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300",
};

function asDateLabel(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}


// ── Component ───────────────────────────────────────────────────────────────

export default function RepoLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const params = useParams();
  
  const username = params.username || params.owner || "";
  const repoName = params.repo_name || params.repo || "";
  const basePath = `/repos/${username}/${repoName}`;
  const isProjectPrefix = location.pathname.startsWith('/project/');
  const finalBasePath = isProjectPrefix ? `/project/${username}/${repoName}` : basePath;

  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [hasAutoGeneratedSummary, setHasAutoGeneratedSummary] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const overviewQuery = useQuery({
    queryKey: ["project-overview", username, repoName],
    enabled: Boolean(username && repoName),
    retry: 0,
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(
          `/api/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/overview`,
          { credentials: "include", signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Overview API error ${response.status}: ${await response.text()}`);
        }
        return (await response.json()) as OverviewResponse;
      } finally {
        clearTimeout(timeout);
      }
    },
  });

  const projectId = overviewQuery.data?.project?.id || "";

  const detailsQuery = useQuery({
    queryKey: ["project-details", username, repoName],
    enabled: Boolean(overviewQuery.data),
    queryFn: async () => {
      const response = await fetch(
        `/api/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to load project details");
      return (await response.json()) as ProjectDetailsResponse;
    },
  });

  const taskQuery = useQuery({
    queryKey: ["project-tasks", username, repoName],
    enabled: Boolean(username && repoName),
    queryFn: async () => {
      const response = await fetch(
        `/api/tasks/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/tasks`,
        { credentials: "include" }
      );
      if (!response.ok) return { success: false, tasks: [] } as TaskListResponse;
      return (await response.json()) as TaskListResponse;
    },
  });

  const favoritesQuery = useQuery({
    queryKey: ["project-favorites"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/favorites`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load favorites");
      const payload = (await response.json()) as { favorites?: FavoriteProject[] };
      return payload.favorites || [];
    },
  });

  const favoriteSet = useMemo(
    () =>
      new Set(
        (favoritesQuery.data || []).map((f) =>
          `${f.repoOwner.toLowerCase()}/${f.repoName.toLowerCase()}`
        )
      ),
    [favoritesQuery.data]
  );
  const favoriteKey = `${username.toLowerCase()}/${repoName.toLowerCase()}`;
  const isFavorite = favoriteSet.has(favoriteKey);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!username || !repoName) return;
      if (isFavorite) {
        const response = await fetch(
          `/api/projects/favorites/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`,
          { method: "DELETE", credentials: "include" }
        );
        if (!response.ok) throw new Error("Failed to remove project favorite.");
        return;
      }
      const response = await fetch("/api/projects/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId, repoOwner: username, repoName }),
      });
      if (!response.ok) throw new Error("Failed to save project favorite.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-favorites"] });
      if (!username || !repoName) return;
      if (isFavorite) {
        pushRecentProject({ repoOwner: username, repoName });
        return;
      }
      removeRecentProject({ repoOwner: username, repoName });
    },
  });

  const generateSummary = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/generate-description`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.text();
    },
    onSuccess: async (data) => {
      if (data) {
        queryClient.setQueryData(["project-lookup", username, repoName], (old: any) => {
          if (!old) return old;
          return { ...old, description: data.trim() };
        });
        setHasAutoGeneratedSummary(true);
      }
      await overviewQuery.refetch();
      handleGlobalSuccess('Summary Generated', "Summary generated successfully");
    },
    onError: (err: any) => {
      handleGlobalError(new Error("Failed to generate summary: " + err.message));
    },
  });

  // ── Side Effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!overviewQuery.isError) return;
    const msg =
      overviewQuery.error instanceof Error ? overviewQuery.error.message : "Failed to load repository";
    handleGlobalError(new Error("Repository not found: " + msg));
  }, [overviewQuery.isError, overviewQuery.error]);

  useEffect(() => {
    if (!overviewQuery.isError) return;
    const msg =
      overviewQuery.error instanceof Error
        ? overviewQuery.error.message
        : "Failed to load project overview";
    handleGlobalError(new Error("Project overview failed: " + msg));
  }, [overviewQuery.isError, overviewQuery.error]);

  useEffect(() => {
    if (!overviewQuery.data?.success) return;
    pushRecentProject({
      repoOwner: overviewQuery.data.repository.owner,
      repoName: overviewQuery.data.repository.name,
      projectName: overviewQuery.data.project.name,
    });
  }, [overviewQuery.data]);

  useEffect(() => {
    const shouldAutoGenerate =
      overviewQuery.data?.success &&
      !overviewQuery.data.project.description &&
      !hasAutoGeneratedSummary &&
      !generateSummary.isPending;
    if (!shouldAutoGenerate) return;
    setHasAutoGeneratedSummary(true);
    generateSummary.mutate();
  }, [generateSummary, hasAutoGeneratedSummary, overviewQuery.data]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      if (!isMetaOrCtrl || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setCommandOpen((open) => !open);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const entries = useMemo(
    () => overviewQuery.data?.codebase.entries || [],
    [overviewQuery.data?.codebase.entries]
  );

  // ── Loading / Error States ─────────────────────────────────────────────────

  if (overviewQuery.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (
    overviewQuery.isError ||
    !overviewQuery.data?.success
  ) {
    const lookupErr = overviewQuery.isError
      ? (overviewQuery.error instanceof Error ? overviewQuery.error.message : "Repository lookup failed")
      : null;
    const overviewErr = !overviewQuery.data?.success ? "Project overview returned unsuccessful" : null;
    const primaryError = lookupErr || overviewErr || "Unknown error";
    const isDbError =
      primaryError.toLowerCase().includes("502") ||
      primaryError.toLowerCase().includes("503") ||
      primaryError.toLowerCase().includes("database") ||
      primaryError.toLowerCase().includes("d1") ||
      primaryError.toLowerCase().includes("unreachable");

    return (
      <div className="space-y-4 p-1">
        <Button variant="ghost" className="-ml-1" onClick={() => navigate("/repos")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Repos
        </Button>
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <span>⚠</span>
              {username}/{repoName} — Unavailable
            </CardTitle>
            <CardDescription className="mt-2 font-mono text-xs text-muted-foreground break-all">
              {primaryError}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isDbError && (
              <p className="text-sm text-amber-400">
                The database appears to be unreachable. Check the{" "}
                <a href="/health" className="underline hover:text-amber-300">System Health</a>{" "}
                page for details.
              </p>
            )}
            {lookupErr && overviewErr && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><span className="text-red-400">Lookup:</span> {lookupErr}</p>
                <p><span className="text-red-400">Overview:</span> {overviewErr}</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => { overviewQuery.refetch(); }}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const projectDetails = detailsQuery.data;

  // Provide to nested queries via context
  const contextValue = {
    projectId,
    repoOwner: username,
    repoName,
    basePath: finalBasePath,
    overview,
    entries,
    projectDetails,
    taskQueryData: taskQuery.data,
    setSelectedEvent,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProjectDashboardLayout>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2 w-full lg:w-auto">
          <Button variant="ghost" className="-ml-3" onClick={() => navigate("/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Repositories
          </Button>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FolderGit2 className="h-6 w-6 text-blue-400" />
              {overview.project.name}
            </h1>
            <a
              href={overview.repository.url || "#"}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View on GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
          <p className="max-w-4xl text-muted-foreground">
            {overview.project.description || "Generating repository summary with Worker AI..."}
          </p>
          <div className="flex flex-wrap gap-2">
            {overview.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className={TAG_STYLES[tag] || "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"}
              >
                {tag}
              </Badge>
            ))}
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Last deployed: {asDateLabel(overview.project.lastDeployedAt)}
          </p>
        </div>
        <div className="flex flex-wrap shrink-0 gap-2 w-full lg:w-auto mt-4 lg:mt-0">
          <Button
            variant="outline"
            className="flex-1 lg:flex-none"
            onClick={() => toggleFavorite.mutate()}
            disabled={toggleFavorite.isPending}
          >
            <Star className={cn("mr-2 h-4 w-4", isFavorite ? "fill-current text-amber-400" : "")} />
            {isFavorite ? "Starred" : "Star"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setCommandOpen(true)}
            className="border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 hover:text-blue-300"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Repo Actions
            <span className="ml-2 rounded border border-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400/60">
              Cmd+K
            </span>
          </Button>
          <Button onClick={() => generateSummary.mutate()} disabled={generateSummary.isPending}>
            {generateSummary.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Summary
              </>
            )}
          </Button>
        </div>
      </div>

      <div>
        <Outlet context={contextValue} />
      </div>

      {/* Activity Detail Dialog */}
      <Dialog open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.summary}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <Tabs defaultValue="relevant" className="h-full flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                <TabsTrigger
                  value="relevant"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  ✨ Relevant Fields
                </TabsTrigger>
                <TabsTrigger
                  value="raw"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  Raw Payload
                </TabsTrigger>
              </TabsList>

              <TabsContent value="relevant" className="flex-1 mt-0 h-[50vh]">
                <ScrollArea className="h-full border rounded-md p-4">
                  {selectedEvent?.rawPayload ? (
                    <div className="space-y-4">
                      {selectedEvent.rawPayload.action && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Action</p>
                          <p className="text-sm">{selectedEvent.rawPayload.action}</p>
                        </div>
                      )}
                      {selectedEvent.rawPayload.commits?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            Commits ({selectedEvent.rawPayload.commits.length})
                          </p>
                          <div className="space-y-2">
                            {selectedEvent.rawPayload.commits.map((commit: any) => (
                              <div key={commit.id} className="rounded-md bg-muted/50 p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="font-mono text-[10px]">
                                    {commit.id.substring(0, 7)}
                                  </Badge>
                                  <span className="text-xs font-medium">{commit.author.name}</span>
                                </div>
                                <p className="text-sm">{commit.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedEvent.rawPayload.pull_request && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Pull Request</p>
                          <div className="rounded-md bg-muted/50 p-3">
                            <a
                              href={selectedEvent.rawPayload.pull_request.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              #{selectedEvent.rawPayload.pull_request.number}{" "}
                              {selectedEvent.rawPayload.pull_request.title}
                            </a>
                            <p className="text-sm text-muted-foreground mt-1">
                              Status: {selectedEvent.rawPayload.pull_request.state}
                            </p>
                          </div>
                        </div>
                      )}
                      {selectedEvent.rawPayload.issue && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Issue</p>
                          <div className="rounded-md bg-muted/50 p-3">
                            <a
                              href={selectedEvent.rawPayload.issue.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              #{selectedEvent.rawPayload.issue.number}{" "}
                              {selectedEvent.rawPayload.issue.title}
                            </a>
                            <p className="text-sm text-muted-foreground mt-1">
                              Status: {selectedEvent.rawPayload.issue.state}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No structured payload extracted from event.
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="raw" className="flex-1 mt-0 h-[50vh]">
                <ScrollArea className="h-full border rounded-md">
                  <pre className="p-4 text-xs font-mono leading-relaxed">
                    {JSON.stringify(selectedEvent?.rawPayload || {}, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Repo Actions Dialog */}
      <RepoActionsDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        repoOwner={username}
        repoName={repoName}
        projectName={overview.project.name}
        repositoryData={{
          owner: overview.repository.owner,
          name: overview.repository.name,
        }}
      />
    </ProjectDashboardLayout>
  );
}
