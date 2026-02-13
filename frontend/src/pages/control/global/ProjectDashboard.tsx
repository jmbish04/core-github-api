import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Cloud,
  FileCode,
  FileJson,
  FileText,
  FolderGit2,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree";
import { AssistantModal } from "@/components/assistant-ui/assistant-modal";
import { PRCommandCenter } from "@/components/PRCommandCenter";
import { ProjectDashboardLayout } from "@/components/project-dashboard/ProjectDashboardLayout";
import { DashboardTab } from "@/components/project-dashboard/tabs/DashboardTab";
import { VibeCodingTab } from "@/components/project-dashboard/tabs/VibeCodingTab";
import { UxWorkshopTab } from "@/components/project-dashboard/tabs/UxWorkshopTab";
import { PlanTab } from "@/components/project-dashboard/tabs/PlanTab";
import { PRCommandCenterTab } from "@/components/project-dashboard/tabs/PRCommandCenterTab";
import { getControlCenterUserId } from "@/lib/control-user";
import { pushRecentProject, removeRecentProject } from "@/lib/project-recents";
import { cn } from "@/lib/utils";

type ProjectLookupResponse = {
  success: boolean;
  projectId: string;
  repoId: string;
  projectName: string;
  projectStatus: string;
  repoOwner: string;
  repoName: string;
};

type OverviewEntry = {
  path: string;
  type: "blob" | "tree";
  size: number;
};

type OverviewResponse = {
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
  }>;
  cloudflare: {
    detected: boolean;
    workerName?: string;
    wranglerFile?: string | null;
    bindings?: Record<string, string[] | null>;
    deployments?: Array<{
      id: string;
      createdAt: string;
      source: string;
    }>;
    dashboardUrl?: string;
  };
};

type ProjectDetailsResponse = {
  success: boolean;
  project: {
    id: string;
    name: string;
  };
  phases: Array<{
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    status: string | null;
  }>;
};

type TaskListResponse = {
  success: boolean;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    phaseId?: string | null;
  }>;
};

type FileResponse = {
  success: boolean;
  path: string;
  language: string;
  truncated: boolean;
  content: string;
};

type FavoriteProject = {
  repoOwner: string;
  repoName: string;
};

type RepoTreeNode = {
  path: string;
  name: string;
  type: "blob" | "tree";
  children: RepoTreeNode[];
};

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

function buildTree(entries: OverviewEntry[]): RepoTreeNode[] {
  const root: RepoTreeNode = {
    path: "",
    name: "",
    type: "tree",
    children: [],
  };

  const ensureNode = (
    parent: RepoTreeNode,
    name: string,
    path: string,
    type: "blob" | "tree",
  ): RepoTreeNode => {
    let found = parent.children.find((child) => child.name === name);
    if (!found) {
      found = { path, name, type, children: [] };
      parent.children.push(found);
    } else if (type === "tree") {
      found.type = "tree";
    }
    return found;
  };

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    let cursor = root;
    for (let index = 0; index < segments.length; index += 1) {
      const name = segments[index];
      const path = segments.slice(0, index + 1).join("/");
      const isLeaf = index === segments.length - 1;
      const type = isLeaf ? entry.type : "tree";
      cursor = ensureNode(cursor, name, path, type);
    }
  }

  const sortNodes = (nodes: RepoTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  };
  sortNodes(root.children);
  return root.children;
}

function iconForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return <FileJson className="h-4 w-4" />;
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".py")
  )
    return <FileCode className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = getControlCenterUserId();
  const params = useParams();
  const username = params.username || params.owner || "";
  const repoName = params.repo_name || params.repo || "";
  const [selectedFile, setSelectedFile] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [assistantSeedPrompt, setAssistantSeedPrompt] = useState<string | null>(null);
  const [hasAutoGeneratedSummary, setHasAutoGeneratedSummary] = useState(false);

  const lookupQuery = useQuery({
    queryKey: ["project-by-repo", username, repoName],
    enabled: Boolean(username && repoName),
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/by-repo/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as ProjectLookupResponse;
    },
  });

  const projectId = lookupQuery.data?.projectId || "";

  const overviewQuery = useQuery({
    queryKey: ["project-overview", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/overview`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load project overview");
      return (await response.json()) as OverviewResponse;
    },
  });

  const detailsQuery = useQuery({
    queryKey: ["project-details", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
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
        {
          credentials: "include",
        },
      );
      if (!response.ok) {
        return { success: false, tasks: [] } as TaskListResponse;
      }
      return (await response.json()) as TaskListResponse;
    },
  });

  const favoritesQuery = useQuery({
    queryKey: ["project-favorites", userId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/favorites?userId=${encodeURIComponent(userId)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load favorites");
      const payload = await response.json() as { favorites?: FavoriteProject[] };
      return payload.favorites || [];
    },
  });

  const favoriteSet = useMemo(
    () =>
      new Set(
        (favoritesQuery.data || []).map((favorite) =>
          `${favorite.repoOwner.toLowerCase()}/${favorite.repoName.toLowerCase()}`,
        ),
      ),
    [favoritesQuery.data],
  );
  const favoriteKey = `${username.toLowerCase()}/${repoName.toLowerCase()}`;
  const isFavorite = favoriteSet.has(favoriteKey);

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!username || !repoName) return;
      if (isFavorite) {
        const response = await fetch(
          `/api/projects/favorites/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}?userId=${encodeURIComponent(userId)}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!response.ok) {
          throw new Error("Failed to remove project favorite.");
        }
        return;
      }

      const response = await fetch("/api/projects/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId,
          repoOwner: username,
          repoName,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save project favorite.");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-favorites", userId] });
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
      if (!projectId) return;
      const response = await fetch(`/api/projects/${projectId}/generate-description`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
    },
    onSuccess: async () => {
      await overviewQuery.refetch();
    },
  });

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
      if (!isMetaOrCtrl) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setCommandOpen((open) => !open);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const entries = overviewQuery.data?.codebase.entries || [];
  const treeData = useMemo(() => buildTree(entries), [entries]);

  useEffect(() => {
    if (!entries.length || selectedFile) return;
    const preferred = ["README.md", "package.json", "wrangler.jsonc", "wrangler.toml"];
    const match = entries.find(
      (entry) =>
        entry.type === "blob" &&
        preferred.some((name) => entry.path.toLowerCase() === name.toLowerCase()),
    );
    if (match) {
      setSelectedFile(match.path);
      return;
    }
    const firstFile = entries.find((entry) => entry.type === "blob");
    if (firstFile) setSelectedFile(firstFile.path);
  }, [entries, selectedFile]);

  const fileQuery = useQuery({
    queryKey: ["project-file", projectId, selectedFile],
    enabled: Boolean(projectId && selectedFile),
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/codebase/file?path=${encodeURIComponent(selectedFile)}`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to load file");
      return (await response.json()) as FileResponse;
    },
  });

  const queueAssistantPrompt = (prompt: string) => {
    setCommandOpen(false);
    setAssistantSeedPrompt(prompt);
  };

  const renderNodes = (nodes: RepoTreeNode[], level = 0) =>
    nodes.map((node, index) => {
      const isLast = index === nodes.length - 1;
      const hasChildren = node.children.length > 0;
      const isFile = node.type === "blob";
      return (
        <TreeNode key={node.path} nodeId={node.path} level={level} isLast={isLast}>
          <TreeNodeTrigger
            onClick={() => {
              if (isFile) setSelectedFile(node.path);
            }}
          >
            <TreeExpander hasChildren={hasChildren} />
            <TreeIcon hasChildren={hasChildren} icon={isFile ? iconForPath(node.path) : undefined} />
            <TreeLabel>{node.name}</TreeLabel>
          </TreeNodeTrigger>
          <TreeNodeContent hasChildren={hasChildren}>{renderNodes(node.children, level + 1)}</TreeNodeContent>
        </TreeNode>
      );
    });

  const groupedTasks = useMemo(() => {
    const byPhase = new Map<string, Array<{ id: string; title: string; status: string }>>();
    for (const task of taskQuery.data?.tasks || []) {
      const key = task.phaseId || "ungrouped";
      if (!byPhase.has(key)) byPhase.set(key, []);
      byPhase.get(key)?.push(task);
    }
    return byPhase;
  }, [taskQuery.data?.tasks]);

  if (lookupQuery.isLoading || overviewQuery.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lookupQuery.isError || !lookupQuery.data?.success || overviewQuery.isError || !overviewQuery.data?.success) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" onClick={() => navigate("/control-center/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Project unavailable</CardTitle>
            <CardDescription>Unable to load this project dashboard.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const projectDetails = detailsQuery.data;

  return (
    <ProjectDashboardLayout>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" className="-ml-3" onClick={() => navigate("/control-center/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">{overview.project.name}</h1>
            <Badge variant="outline">{overview.project.status}</Badge>
            <Badge variant="secondary">{overview.repository.owner}/{overview.repository.name}</Badge>
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
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => toggleFavorite.mutate()} disabled={toggleFavorite.isPending}>
            <Star className={cn("mr-2 h-4 w-4", isFavorite ? "fill-current text-amber-400" : "")} />
            {isFavorite ? "Starred" : "Star"}
          </Button>
          <Button variant="outline" onClick={() => setCommandOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" />
            Repo Actions
            <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Cmd/Ctrl+K
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

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="vibesdk">VibeSDK</TabsTrigger>
          <TabsTrigger value="ux-workshop">UX Workshop</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="pr-command">PR Command Center</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab>
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
                <Button
                  size="sm"
                  onClick={() =>
                    queueAssistantPrompt(
                      "Standardize Worker architecture and create an actionable refactor task for Jules.",
                    )
                  }
                >
                  Trigger Agent
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Codebase Visualization</CardTitle>
                <CardDescription>
                  Kibo tree explorer with direct file inspection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid h-[520px] grid-cols-[320px_1fr] overflow-hidden rounded-md border">
                  <div className="border-r bg-card/60">
                    <ScrollArea className="h-full">
                      <TreeProvider
                        defaultExpandedIds={["src", "backend", "frontend", "app"]}
                        selectedIds={selectedFile ? [selectedFile] : []}
                      >
                        <TreeView>{renderNodes(treeData)}</TreeView>
                      </TreeProvider>
                    </ScrollArea>
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                      {selectedFile || "Select a file"}
                    </div>
                    <ScrollArea className="h-full">
                      <pre className="whitespace-pre-wrap p-4 text-xs leading-relaxed">
                        {fileQuery.isLoading ? "Loading file..." : fileQuery.data?.content || "No file selected."}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
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
                      <a
                        key={pr.number}
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md border p-3 hover:bg-muted/40"
                      >
                        <p className="text-sm font-medium">#{pr.number} {pr.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {pr.author} • {asDateLabel(pr.updatedAt)}
                        </p>
                      </a>
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
                      <div key={event.id} className="rounded-md border p-3">
                        <p className="text-sm font-medium">{event.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.actor} • {asDateLabel(event.createdAt)}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Cloudflare Runtime
              </CardTitle>
              <CardDescription>Bindings, build status, and observability links.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {overview.cloudflare.detected ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline">Worker: {overview.cloudflare.workerName}</Badge>
                    {overview.cloudflare.wranglerFile ? (
                      <Badge variant="outline">Config: {overview.cloudflare.wranglerFile}</Badge>
                    ) : null}
                    {overview.cloudflare.dashboardUrl ? (
                      <a
                        href={overview.cloudflare.dashboardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-400 underline underline-offset-4"
                      >
                        Open Observability + Deployments
                      </a>
                    ) : null}
                  </div>

                  {overview.cloudflare.bindings ? (
                    <div className="space-y-2">
                      {Object.entries(overview.cloudflare.bindings).map(([group, bindings]) => {
                        const list = (bindings || []).filter(Boolean);
                        if (!list.length) return null;
                        return (
                          <div key={group} className="flex flex-wrap items-center gap-2">
                            <span className="w-28 text-xs uppercase tracking-wide text-muted-foreground">
                              {group}
                            </span>
                            {list.map((binding) => (
                              <Badge key={`${group}-${binding}`} variant="outline">
                                {binding}
                              </Badge>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Cloudflare Worker configuration detected from repository analysis.
                </p>
              )}
            </CardContent>
          </Card>
          </DashboardTab>
        </TabsContent>

        <TabsContent value="vibesdk" className="space-y-4">
          <VibeCodingTab
            projectId={projectId}
            projectName={overview.project.name}
            repoOwner={overview.repository.owner}
            repoName={overview.repository.name}
          />
        </TabsContent>

        <TabsContent value="ux-workshop" className="space-y-4">
          <UxWorkshopTab>
          <Card>
            <CardHeader>
              <CardTitle>UX Workshop</CardTitle>
              <CardDescription>
                Chat with the UX Architect agent to generate design studies and Stitch-ready mockup tasks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-md border p-4 space-y-3">
                  <h4 className="font-medium">Design Agent Actions</h4>
                  <Button
                    onClick={() =>
                      queueAssistantPrompt(
                        "Act as UX Architect. Generate a complete UX design study for this repository and prepare a Stitch handoff.",
                      )
                    }
                  >
                    Start UX Study
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      queueAssistantPrompt(
                        "Convert approved UX concepts into implementation tasks and assign them to Jules.",
                      )
                    }
                  >
                    Handoff to Coding Agent
                  </Button>
                </div>
                <div className="rounded-md border p-4">
                  <h4 className="mb-2 font-medium">Mockup Preview</h4>
                  <p className="text-sm text-muted-foreground">
                    Mockups generated from Stitch handoff will appear here.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </UxWorkshopTab>
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          <PlanTab>
          <Card>
            <CardHeader>
              <CardTitle>Project Plan</CardTitle>
              <CardDescription>
                Epic → User Stories → Tasks with agent assignment support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    queueAssistantPrompt(
                      "Outline this repository as epics > user stories > tasks and save it to project tables.",
                    )
                  }
                >
                  Generate Plan Blueprint
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    queueAssistantPrompt(
                      "Assign top pending plan tasks to an implementation agent and create actionable execution steps.",
                    )
                  }
                >
                  Assign to Agent
                </Button>
              </div>

              <div className="space-y-3">
                {(projectDetails?.phases || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No phases are currently defined for this project.
                  </p>
                ) : (
                  projectDetails?.phases.map((phase) => (
                    <div key={phase.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium">{phase.name}</h4>
                        <Badge variant="outline">{phase.status || "pending"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {phase.description || "No phase description provided."}
                      </p>
                      <div className="mt-3 space-y-2">
                        {(groupedTasks.get(phase.id) || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No tasks mapped to this phase.</p>
                        ) : (
                          groupedTasks.get(phase.id)?.map((task) => (
                            <div key={task.id} className="flex items-center justify-between rounded border px-3 py-2">
                              <span className="text-sm">{task.title}</span>
                              <Badge variant="secondary">{task.status}</Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}

                {(groupedTasks.get("ungrouped") || []).length > 0 && (
                  <div className="rounded-md border p-4">
                    <h4 className="font-medium">Unassigned Tasks</h4>
                    <div className="mt-3 space-y-2">
                      {groupedTasks.get("ungrouped")?.map((task) => (
                        <div key={task.id} className="flex items-center justify-between rounded border px-3 py-2">
                          <span className="text-sm">{task.title}</span>
                          <Badge variant="secondary">{task.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </PlanTab>
        </TabsContent>

        <TabsContent value="pr-command" className="space-y-4">
          <PRCommandCenterTab>
          <Card>
            <CardHeader>
              <CardTitle>PR Command Center</CardTitle>
              <CardDescription>
                Review open PRs, run agentic code review, and automate fixes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PRCommandCenter />
            </CardContent>
          </Card>
          </PRCommandCenterTab>
        </TabsContent>
      </Tabs>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search project actions..." />
        <CommandList>
          <CommandEmpty>No action found.</CommandEmpty>
          <CommandGroup heading="Design">
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Generate a landing page implementation task and assign it to Jules.",
                )
              }
            >
              Generate Landing Page
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Analyze this backend and design a comprehensive frontend UX study. Submit Stitch-ready requirements.",
                )
              }
            >
              Design Frontend
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Maintenance">
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Create a cleanup task: modularize code, improve docstrings, and reduce technical debt.",
                )
              }
            >
              Clean up code
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Set up Cloudflare CI/CD with deployment checks and automated rollback strategy.",
                )
              }
            >
              Setup CI/CD
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Observability">
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Inspect recent logs and summarize production issues with remediation steps.",
                )
              }
            >
              Show recent logs
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Check build and deployment status, then explain failures and suggested fixes.",
                )
              }
            >
              Check build status
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Review pending pull requests and prioritize by deployment risk.",
                )
              }
            >
              Prioritize pending PRs
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <AssistantModal
        projectId={projectId}
        projectName={overview.project.name}
        initialPrompt={assistantSeedPrompt}
        onInitialPromptConsumed={() => setAssistantSeedPrompt(null)}
      />
    </ProjectDashboardLayout>
  );
}
