/**
 * @file tabs/ExplorerTab.tsx
 * @description File explorer tab — Kibo tree component for repository browsing
 * with inline file content preview.
 */

import { useState, useMemo, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCode,
  FileJson,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type OverviewEntry = {
  path: string;
  type: "blob" | "tree";
  size: number;
};

type RepoTreeNode = {
  path: string;
  name: string;
  type: "blob" | "tree";
  children: RepoTreeNode[];
};

type FileResponse = {
  success: boolean;
  path: string;
  language: string;
  truncated: boolean;
  content: string;
};

function buildTree(entries: OverviewEntry[]): RepoTreeNode[] {
  const root: RepoTreeNode = { path: "", name: "", type: "tree", children: [] };
  const ensureNode = (
    parent: RepoTreeNode,
    name: string,
    path: string,
    type: "blob" | "tree"
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
    for (let index = 0; index < segments.length; index++) {
      const name = segments[index];
      const path = segments.slice(0, index + 1).join("/");
      const isLeaf = index === segments.length - 1;
      cursor = ensureNode(cursor, name, path, isLeaf ? entry.type : "tree");
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

interface ExplorerTabProps {
  repoOwner: string;
  repoName: string;
  entries: OverviewEntry[];
}

export function ExplorerTab({ repoOwner, repoName, entries }: ExplorerTabProps) {
  const pickInitialFile = (list: OverviewEntry[]): string => {
    const preferred = ["README.md", "package.json", "wrangler.jsonc", "wrangler.toml"];
    const match = list.find(
      (e) =>
        e.type === "blob" &&
        preferred.some((name) => e.path.toLowerCase() === name.toLowerCase())
    );
    return (match ?? list.find((e) => e.type === "blob"))?.path ?? "";
  };

  const [selectedFile, setSelectedFile] = useState(() => pickInitialFile(entries));
  const treeData = useMemo(() => buildTree(entries), [entries]);

  const fileQuery = useQuery({
    queryKey: ["project-file", repoOwner, repoName, selectedFile],
    enabled: Boolean(repoOwner && repoName && selectedFile),
    queryFn: async () => {
      const response = await fetch(
        `/api/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/codebase/file?path=${encodeURIComponent(selectedFile)}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to load file");
      return (await response.json()) as FileResponse;
    },
  });

  const renderNodes = (nodes: RepoTreeNode[], level = 0): ReactElement[] =>
    nodes.map((node, index) => {
      const isLast = index === nodes.length - 1;
      const hasChildren = node.children.length > 0;
      const isFile = node.type === "blob";
      return (
        <TreeNode key={node.path} nodeId={node.path} level={level} isLast={isLast}>
          <TreeNodeTrigger onClick={() => { if (isFile) setSelectedFile(node.path); }}>
            <TreeExpander hasChildren={hasChildren} />
            <TreeIcon hasChildren={hasChildren} icon={isFile ? iconForPath(node.path) : undefined} />
            <TreeLabel>{node.name}</TreeLabel>
          </TreeNodeTrigger>
          <TreeNodeContent hasChildren={hasChildren}>
            {renderNodes(node.children, level + 1)}
          </TreeNodeContent>
        </TreeNode>
      );
    });

  return (
    <Card className="flex flex-col overflow-hidden h-[calc(100vh-12rem)] min-h-[500px]">
      <CardHeader>
        <CardTitle>Codebase Visualization</CardTitle>
        <CardDescription>Kibo tree explorer with direct file inspection.</CardDescription>
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
  );
}
