import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Cloud,
  FileCode,
  FileJson,
  FileText,
  FolderGit2,
  GitPullRequest,
  Loader2,
  Sparkles,
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

type FileResponse = {
  success: boolean;
  path: string;
  language: string;
  truncated: boolean;
  content: string;
};

type RepoTreeNode = {
  path: string;
  name: string;
  type: "blob" | "tree";
  children: RepoTreeNode[];
};

const TAG_STYLES: Record<string, string> = {
  Python: "border-yellow-500/50 bg-yellow-500/15 text-yellow-300",
  Workers: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  Cloudflare: "border-cyan-500/50 bg-cyan-500/15 text-cyan-300",
  TypeScript: "border-blue-500/50 bg-blue-500/15 text-blue-300",
  JavaScript: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  React: "border-sky-500/50 bg-sky-500/15 text-sky-300",
  Astro: "border-purple-500/50 bg-purple-500/15 text-purple-300",
  "Node.js": "border-lime-500/50 bg-lime-500/15 text-lime-300",
  Docker: "border-indigo-500/50 bg-indigo-500/15 text-indigo-300",
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

export default function ProjectView() {
  const navigate = useNavigate();
  const { projectId = "" } = useParams();
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [assistantSeedPrompt, setAssistantSeedPrompt] = useState<string | null>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/overview`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load project overview");
      return ((await response.json()) as any) as OverviewResponse;
    },
    enabled: Boolean(projectId),
  });

  const entries = data?.codebase.entries || [];
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.path, entry])), [entries]);
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
    enabled: Boolean(projectId && selectedFile),
  });

  const runGenerateDescription = async () => {
    setIsGeneratingDescription(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/generate-description`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refetch();
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const queueAssistantPrompt = (prompt: string) => {
    setCommandOpen(false);
    setAssistantSeedPrompt(prompt);
  };

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

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" onClick={() => navigate("/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Project unavailable</CardTitle>
            <CardDescription>Unable to load this project view.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Button variant="ghost" className="-ml-3" onClick={() => navigate("/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <FolderGit2 className="h-5 w-5 shrink-0 text-blue-400" />
            <h1 className="truncate text-3xl font-bold tracking-tight">{data.project.name}</h1>
            <Badge variant="outline" className="shrink-0">{data.project.status}</Badge>
          </div>
          <p className="max-w-4xl text-muted-foreground">
            {data.project.description || "No summary saved yet. Generate one from repository analysis."}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.tags.map((tag) => (
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
            Last deployed: {asDateLabel(data.project.lastDeployedAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setCommandOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" />
            Repo Actions
            <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Cmd/Ctrl+K
            </span>
          </Button>
          <Button onClick={runGenerateDescription} disabled={isGeneratingDescription}>
            {isGeneratingDescription ? (
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Codebase</CardTitle>
            <CardDescription>
              Explore repository tree and inspect source files.
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
              {data.pendingPrs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open pull requests.</p>
              ) : (
                data.pendingPrs.slice(0, 8).map((pr) => (
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
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity available.</p>
              ) : (
                data.recentActivity.slice(0, 10).map((event) => (
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
          <CardDescription>
            Worker bindings, deployments, and observability links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.cloudflare.detected ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">Worker: {data.cloudflare.workerName}</Badge>
                {data.cloudflare.wranglerFile ? (
                  <Badge variant="outline">Config: {data.cloudflare.wranglerFile}</Badge>
                ) : null}
                {data.cloudflare.dashboardUrl ? (
                  <a
                    href={data.cloudflare.dashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-400 underline underline-offset-4"
                  >
                    Open Observability + Deployments
                  </a>
                ) : null}
              </div>

              {data.cloudflare.bindings ? (
                <div className="space-y-2">
                  {Object.entries(data.cloudflare.bindings).map(([group, bindings]) => {
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

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Recent Deployments</h4>
                {data.cloudflare.deployments?.length ? (
                  data.cloudflare.deployments.map((deployment) => (
                    <div key={deployment.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{deployment.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {asDateLabel(deployment.createdAt)} • {deployment.source}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No deployment records were returned for this worker.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Cloudflare Worker configuration detected from repository analysis.
            </p>
          )}
        </CardContent>
      </Card>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search repo actions..." />
        <CommandList>
          <CommandEmpty>No action found.</CommandEmpty>
          <CommandGroup heading="Product + UX">
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
                  "Design a frontend UX study for this backend-focused repository and prepare Stitch-ready mockup requirements.",
                )
              }
            >
              Design a Frontend
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Create a full PRD for this repository with goals, non-goals, architecture, and rollout plan.",
                )
              }
            >
              Create PRD
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Planning + Delivery">
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Outline implementation as epic > user stories > tasks and save it for project management.",
                )
              }
            >
              Outline Epic & Tasks
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Assign Jules a cleanup task: improve modularity, docstrings, and code structure.",
                )
              }
            >
              Clean Up Code
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Assign Jules a task to set up Cloudflare dashboard driven CI/CD, deployment guards, and automation.",
                )
              }
            >
              Setup Cloudflare CI/CD
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Analysis">
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Answer questions about this codebase and highlight architectural risks.",
                )
              }
            >
              Codebase Q&A
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Examine likely worker build/deploy issues and propose remediation steps.",
                )
              }
            >
              Analyze Build Logs
            </CommandItem>
            <CommandItem
              onSelect={() =>
                queueAssistantPrompt(
                  "Review open pull requests and prioritize by deployment impact.",
                )
              }
            >
              Prioritize Pending PRs
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <AssistantModal
        projectId={projectId}
        projectName={data.project.name}
        initialPrompt={assistantSeedPrompt}
        onInitialPromptConsumed={() => setAssistantSeedPrompt(null)}
      />
    </div>
  );
}
