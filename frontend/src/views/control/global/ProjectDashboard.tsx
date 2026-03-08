import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconGitBranch } from "@tabler/icons-react"
import {
  ArrowLeft,
  CalendarClock,
  Cloud,
  FileCode,
  FileJson,
  FileText,
  FolderGit2,
  GitCommitHorizontal,
  Github,
  GitPullRequest,
  Loader2,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
// import { AssistantModal } from "@/components/assistant-ui/assistant-modal";
import { PRCommandCenter } from "@/components/PRCommandCenter";
import { ProjectDashboardLayout } from "@/components/project-dashboard/ProjectDashboardLayout";
import { DashboardTab } from "@/components/project-dashboard/tabs/DashboardTab";
import { VibeCodingTab } from "@/components/project-dashboard/tabs/VibeCodingTab";
import { UxWorkshopTab } from "@/components/project-dashboard/tabs/UxWorkshopTab";
import { PlanTab } from "@/components/project-dashboard/tabs/PlanTab";
import { PRCommandCenterTab } from "@/components/project-dashboard/tabs/PRCommandCenterTab";
import { CloudflareSdkDashboard } from "@/components/cloudflaresdk/CloudflareSdkDashboard";
import { ComponentIdentifierTab } from "@/components/project-dashboard/tabs/ComponentIdentifierTab";
import { CloudflareDocsTool } from "@/components/tools/CloudflareDocsTool";
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
    rawPayload: any;
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
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  // const [assistantSeedPrompt, setAssistantSeedPrompt] = useState<string | null>(null);
  const [hasAutoGeneratedSummary, setHasAutoGeneratedSummary] = useState(false);

  // URL-synced tab routing
  const TAB_SLUG_MAP: Record<string, string> = {
    dashboard: "stats",
    stats: "stats",
    explorer: "explorer",
    cloudflaresdk: "cloudflaresdk",
    vibesdk: "vibesdk",
    "ux-workshop": "ux-workshop",
    plan: "plan",
    "pr-command": "prs",
    prs: "prs",
    tools: "tools"
  };
  const TAB_TO_SLUG: Record<string, string> = {
    stats: "stats",
    explorer: "explorer",
    cloudflaresdk: "cloudflaresdk",
    vibesdk: "vibesdk",
    "ux-workshop": "ux-workshop",
    plan: "plan",
    prs: "prs",
    tools: "tools"
  };
  const rawTab = params.tab || "stats";
  const activeTab = TAB_SLUG_MAP[rawTab] || "stats";
  const basePath = params.owner ? `/project/${username}/${repoName}` : `/projects/${username}/${repoName}`;

  const handleTabChange = (tab: string) => {
    const slug = TAB_TO_SLUG[tab] || "dashboard";
    navigate(`${basePath}/${slug}`, { replace: true });
  };

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
      return ((await response.json()) as any) as ProjectLookupResponse;
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
      return ((await response.json()) as any) as OverviewResponse;
    },
  });

  const detailsQuery = useQuery({
    queryKey: ["project-details", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load project details");
      return ((await response.json()) as any) as ProjectDetailsResponse;
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
      return ((await response.json()) as any) as TaskListResponse;
    },
  });

  const favoritesQuery = useQuery({
    queryKey: ["project-favorites", userId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/favorites?userId=${encodeURIComponent(userId)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load favorites");
      const payload = (await response.json()) as any as { favorites?: FavoriteProject[] };
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
          projectId,
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
      return await response.text();
    },
    onSuccess: async () => {
      await overviewQuery.refetch();
      toast.success("Summary generated successfully");
    },
    onError: (err: any) => {
      toast.error("Failed to generate summary", { description: err.message });
      setHasAutoGeneratedSummary(false);
    }
  });

  const generateDocstrings = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      const response = await fetch(`/api/projects/${projectId}/docstrings/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ files: [] }) 
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast.success("Docstrings PR Created!", {
        description: `Check the PR: ${data.prUrl}`,
        action: {
          label: "View PR",
          onClick: () => window.open(data.prUrl, "_blank")
        }
      });
    },
    onError: (err: any) => {
      toast.error("Failed to generate docstrings", { description: err.message });
    }
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
      return ((await response.json()) as any) as FileResponse;
    },
  });

  const queueAssistantPrompt = (prompt: string) => {
    // setCommandOpen(false);
    // setAssistantSeedPrompt(prompt);
    console.log("Legacy prompt queued:", prompt);
    toast.info("Agent Request Queued", {
        description: prompt,
    });
  };

  const handleSyncSecrets = async (force = false) => {
    setCommandOpen(false);
    if (!overview.repository?.owner || !overview.repository?.name) {
        toast.error("Repository information missing.");
        return;
    }
    
    const toastId = toast.loading("Syncing secrets to GitHub...");
    try {
        const res = await fetch("/api/ops/secrets/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                owner: overview.repository.owner,
                repo: overview.repository.name,
                force
            })
        });
        
        const data = (await res.json()) as any as { success: boolean; results?: any[]; error?: string };
        
        if (!res.ok || !data.success) {
            throw new Error(data.error || "Failed to sync secrets");
        }
        
        toast.success("Secrets Synced Successfully", {
            id: toastId,
            description: `Updated ${data.results?.length || 0} secrets in ${overview.repository.owner}/${overview.repository.name}`
        });
    } catch (e: any) {
        toast.error("Failed to Sync Secrets", {
            id: toastId,
            description: e.message
        });
    }
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
        <Button variant="ghost" onClick={() => navigate("/projects")}>
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
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2 w-full lg:w-auto">
          <Button variant="ghost" className="-ml-3" onClick={() => navigate("/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FolderGit2 className="h-6 w-6 text-blue-400" />
              {overview.project.name}
            </h1>
            <a 
              href={overview.repository.url || '#'} 
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
          <Button variant="outline" className="flex-1 lg:flex-none" onClick={() => toggleFavorite.mutate()} disabled={toggleFavorite.isPending}>
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

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 w-full">
        <TabsList className="flex flex-wrap h-auto w-full justify-start overflow-x-auto gap-1 pb-1">
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="explorer">File Explorer</TabsTrigger>
          <TabsTrigger value="cloudflaresdk">CloudflareSDK</TabsTrigger>
          <TabsTrigger value="vibesdk">VibeSDK</TabsTrigger>
          <TabsTrigger value="ux-workshop">UX Workshop</TabsTrigger>
          <TabsTrigger value="component-identifier">Shadcn Components</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="prs">PRs</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
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
                  onClick={async () => {
                    const toastId = toast.loading("Dispatching to Jules...");
                    try {
                      const res = await fetch(`/api/projects/${projectId}/jules/dispatch`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          prompt: "Standardize Worker architecture and create an actionable refactor task for Jules.",
                          projectName: overview.project.name,
                          repoFullName: overview.repository.fullName
                        })
                      });
                      const data = await res.json() as any;
                      if (!res.ok || !data.success) throw new Error(data.error || "Failed dispatch");
                      toast.success("Dispatched to Jules", {
                        id: toastId,
                        description: `Session tracking ID: ${data.sessionId}`
                      });
                    } catch (e: any) {
                      toast.error("Dispatch Failed", {
                        id: toastId,
                        description: e.message
                      });
                    }
                  }}
                >
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
                        <p className="text-sm font-medium">#{pr.number} {pr.title}</p>
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
                        onClick={() => setSelectedEvent(event)}
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
        </TabsContent>

        <TabsContent value="explorer" className="space-y-4 h-full">
          <Card className="flex flex-col overflow-hidden h-[calc(100vh-12rem)] min-h-[500px]">
            <CardHeader>
              <CardTitle>Codebase Visualization</CardTitle>
              <CardDescription>
                Kibo tree explorer with direct file inspection.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 p-0">
              <div className="flex-1 grid grid-cols-[320px_1fr] overflow-hidden rounded-md border m-0 h-full">
                <div className="border-r bg-card/60 flex flex-col min-h-0 h-full">
                  <ScrollArea className="flex-1 h-full">
                    <div className="p-2">
                      <TreeProvider
                        defaultExpandedIds={["src", "backend", "frontend", "app"]}
                        selectedIds={selectedFile ? [selectedFile] : []}
                      >
                        <TreeView>{renderNodes(treeData)}</TreeView>
                      </TreeProvider>
                    </div>
                  </ScrollArea>
                </div>
                <div className="flex min-h-0 flex-col h-full">
                  <div className="border-b px-3 py-2 text-xs text-muted-foreground shrink-0">
                    {selectedFile || "Select a file"}
                  </div>
                  <ScrollArea className="flex-1 h-full">
                    <pre className="whitespace-pre-wrap p-4 text-xs leading-relaxed font-mono">
                      {fileQuery.isLoading ? "Loading file..." : fileQuery.data?.content || "No file selected."}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cloudflaresdk" className="space-y-4">
          <CloudflareSdkDashboard 
            projectId={projectId}
            projectName={overview.project.name}
            repoOwner={overview.repository.owner}
            repoName={overview.repository.name}
            overview={overview}
          />
        </TabsContent>

        <TabsContent value="vibesdk" className="space-y-4">
          <VibeCodingTab
            projectId={projectId}
            projectName={overview.project.name}
            repoOwner={overview.repository.owner}
            repoName={overview.repository.name}
          />
        </TabsContent>

        <TabsContent value="component-identifier" className="space-y-4">
          <ComponentIdentifierTab
            repoFullName={`${overview.repository.owner}/${overview.repository.name}`}
          />
        </TabsContent>

        <TabsContent value="ux-workshop" className="space-y-4">
          <UxWorkshopTab 
            projectId={projectId}
            projectName={overview.project.name}
          />
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          <PlanTab
            projectId={projectId}
            projectName={overview.project.name}
            phases={projectDetails?.phases || []}
            tasks={taskQuery.data?.tasks || []}
          />
        </TabsContent>

        <TabsContent value="prs" className="space-y-4">
          <PRCommandCenterTab>
          <Card>
            <CardHeader>
              <CardTitle>PR Command Center</CardTitle>
              <CardDescription>
                Review open PRs, run agentic code review, and automate fixes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PRCommandCenter 
                repoOwner={overview.repository.owner} 
                repoName={overview.repository.name}
                initialPrs={overview.pendingPrs}
              />
            </CardContent>
          </Card>
          </PRCommandCenterTab>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
            <CloudflareDocsTool 
                defaultOwner={overview.repository.owner} 
                defaultRepo={overview.repository.name} 
            />
        </TabsContent>
      </Tabs>

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
                           <p className="text-sm font-medium text-muted-foreground mb-2">Commits ({selectedEvent.rawPayload.commits.length})</p>
                           <div className="space-y-2">
                             {selectedEvent.rawPayload.commits.map((commit: any) => (
                               <div key={commit.id} className="rounded-md bg-muted/50 p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="font-mono text-[10px]">{commit.id.substring(0, 7)}</Badge>
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
                             <a href={selectedEvent.rawPayload.pull_request.html_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                               #{selectedEvent.rawPayload.pull_request.number} {selectedEvent.rawPayload.pull_request.title}
                             </a>
                             <p className="text-sm text-muted-foreground mt-1">Status: {selectedEvent.rawPayload.pull_request.state}</p>
                           </div>
                        </div>
                      )}
                      
                      {selectedEvent.rawPayload.issue && (
                        <div>
                           <p className="text-sm font-medium text-muted-foreground mb-2">Issue</p>
                           <div className="rounded-md bg-muted/50 p-3">
                             <a href={selectedEvent.rawPayload.issue.html_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                               #{selectedEvent.rawPayload.issue.number} {selectedEvent.rawPayload.issue.title}
                             </a>
                             <p className="text-sm text-muted-foreground mt-1">Status: {selectedEvent.rawPayload.issue.state}</p>
                           </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No structured payload extracted from event.</p>
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

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search project actions..." />
        <CommandList>
          <CommandEmpty>No action found.</CommandEmpty>
          <CommandGroup heading="Design">
            <CommandItem
              value="generate-landing-page"
              onSelect={() =>
                queueAssistantPrompt(
                  "Generate a landing page implementation task and assign it to Jules.",
                )
              }
            >
              Generate Landing Page
            </CommandItem>
            <CommandItem
              value="design-frontend"
              onSelect={() =>
                queueAssistantPrompt(
                  "Analyze this backend and design a comprehensive frontend UX study. Submit Stitch-ready requirements.",
                )
              }
            >
              Design Frontend
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Operations">
            <CommandItem
                value="sync-default-secrets"
                onSelect={() => handleSyncSecrets(true)}
            >
                Sync Default Secrets
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Maintenance">
             <CommandItem
                value="generate-docstrings-pr"
                disabled={!projectId}
                onSelect={() => {
                    if (!projectId) return;
                    setCommandOpen(false);
                    generateDocstrings.mutate();
                }}
            >
                <Sparkles className={cn("mr-2 h-4 w-4", !projectId ? "text-muted-foreground/30" : "text-orange-400")} />
                Generate Docstrings PR
            </CommandItem>
            <CommandItem
              value="clean-up-code"
              onSelect={() =>
                queueAssistantPrompt(
                  "Create a cleanup task: modularize code, improve docstrings, and reduce technical debt.",
                )
              }
            >
              Clean up code
            </CommandItem>
            <CommandItem
              value="setup-cicd"
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
              value="show-recent-logs"
              onSelect={() =>
                queueAssistantPrompt(
                  "Inspect recent logs and summarize production issues with remediation steps.",
                )
              }
            >
              Show recent logs
            </CommandItem>
            <CommandItem
              value="check-build-status"
              onSelect={() =>
                queueAssistantPrompt(
                  "Check build and deployment status, then explain failures and suggested fixes.",
                )
              }
            >
              Check build status
            </CommandItem>
            <CommandItem
              value="prioritize-pending-prs"
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

      {/* <AssistantModal
        projectId={projectId}
        projectName={overview.project.name}
        initialPrompt={assistantSeedPrompt}
        onInitialPromptConsumed={() => setAssistantSeedPrompt(null)}
      /> */}
    </ProjectDashboardLayout>
  );
}
