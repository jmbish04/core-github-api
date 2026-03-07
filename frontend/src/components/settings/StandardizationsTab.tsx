import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  BookOpen,
  ExternalLink,
  FileCode2,
  FileJson2,
  FolderCog,
  GitBranch,
  RefreshCw,
  Shield,
} from "lucide-react";

const STANDARDIZATION_REPO =
  "https://github.com/jmbish04/core-github-standardization";

const AGENT_RULE_FILES = [
  {
    name: "000-bootstrap.md",
    description: "Mandatory pre-flight workspace context and SDK verification",
  },
  {
    name: "000-core-directive.md",
    description: "Core directive for protocol enforcement and workspace verification",
  },
  {
    name: "AGENT_GOVERNANCE.md",
    description:
      "Manager-Worker pattern, MCP tool integration, sandbox & vectorization rules",
  },
  {
    name: "architecture.md",
    description: "Data layer isolation, Hono RPC communication, and operational flow",
  },
  {
    name: "paths.md",
    description: "Absolute pathing, alias standards (@/*, @db/*, @api/*)",
  },
  {
    name: "workspace-awareness.md",
    description: "pnpm workspace commands, --filter protocol, state management",
  },
];

const WORKFLOW_FILES = [
  {
    name: "deploy.yml",
    description: "Cloudflare Workers deployment pipeline",
  },
  {
    name: "lint-and-test.yml",
    description: "TypeScript linting, type-checking, and test runner",
  },
  {
    name: "pr-review.yml",
    description: "Automated PR code review with AI agent",
  },
];

const MCP_CONFIG_PREVIEW = {
  mcpServers: {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
    },
    cloudflare: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-cloudflare"],
    },
    "assistant-ui": {
      command: "npx",
      args: ["-y", "@assistant-ui/mcp-server"],
    },
  },
};

function handleRefresh(section: string) {
  toast.promise(new Promise((r) => setTimeout(r, 1200)), {
    loading: `Refreshing ${section} from source…`,
    success: `${section} refreshed`,
    error: `Failed to refresh ${section}`,
  });
}

export function StandardizationsTab() {
  return (
    <div className="space-y-6">
      {/* MCP Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <FileJson2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle>MCP Configuration</CardTitle>
              <CardDescription>
                Master <code className="rounded bg-muted px-1 py-0.5 text-xs">mcp.json</code>{" "}
                synced to all repositories.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRefresh("MCP config")}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-auto rounded-lg border bg-muted/30 p-4">
            <pre className="font-mono text-xs leading-relaxed">
              {JSON.stringify(MCP_CONFIG_PREVIEW, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" asChild>
              <a
                href={`${STANDARDIZATION_REPO}/blob/main/mcp.json`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Edit on GitHub
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Agent Rules */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <CardTitle>Agent Rules</CardTitle>
              <CardDescription>
                Files injected into{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">.agents/rules/</code>{" "}
                for every connected repository.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRefresh("Agent Rules")}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {AGENT_RULE_FILES.map((file) => (
              <a
                key={file.name}
                href={`${STANDARDIZATION_REPO}/blob/main/.agents/rules/${file.name}`}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-purple-500/30 hover:bg-purple-500/5"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="h-4 w-4 shrink-0 text-purple-400" />
                  <div>
                    <span className="font-mono text-sm font-medium">
                      {file.name}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {file.description}
                    </p>
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GitHub Workflows */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <GitBranch className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle>GitHub Workflows</CardTitle>
              <CardDescription>
                CI/CD automations injected into{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  .github/workflows/
                </code>
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRefresh("Workflows")}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {WORKFLOW_FILES.map((file) => (
              <a
                key={file.name}
                href={`${STANDARDIZATION_REPO}/blob/main/.github/workflows/${file.name}`}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5"
              >
                <div className="flex items-center gap-3">
                  <FileCode2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-mono text-sm font-medium">
                      {file.name}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {file.description}
                    </p>
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sync All Standards</p>
              <p className="text-xs text-muted-foreground">
                Push all files (MCP, rules, workflows) to connected
                repositories.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                toast.promise(new Promise((r) => setTimeout(r, 2500)), {
                  loading:
                    "Syncing all standard files to connected repositories…",
                  success: "Standardization sync queued",
                  error: "Failed to queue sync",
                })
              }
            >
              <FolderCog className="mr-2 h-4 w-4" />
              Sync Standards
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
