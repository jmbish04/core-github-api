/**
 * RepoActionsDialog.tsx
 *
 * Shared sidebar-in-dialog component for Repo Actions.
 * Uses the Shadcn sidebar-13 pattern: sidebar (left) + content pane (right).
 * All dispatch logic is self-contained — consumers just pass repo context.
 */

import { useState, useCallback } from "react";
import { Loader2, Wand2, Play, ChevronRight } from "lucide-react";
import { handleGlobalLoading, handleGlobalInfo } from '@/lib/notification-handler';
import { handleGlobalError } from "@/lib/error-handler";
import { handleGlobalSuccess } from "@/lib/success-handler";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import {
  REPO_ACTIONS,
  getGroupedActions,
  type RepoAction,
} from "./action-registry";

// ── Types ──────────────────────────────────────────────────────────────────

interface RepoActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoOwner: string;
  repoName: string;
  projectName: string;
  /** Full overview for extracting repo details (used by sync-secrets) */
  repositoryData?: {
    owner: string;
    name: string;
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export function RepoActionsDialog({
  open,
  onOpenChange,
  repoOwner,
  repoName,
  projectName,
  repositoryData,
}: RepoActionsDialogProps) {
  const [selectedAction, setSelectedAction] = useState<RepoAction>(
    REPO_ACTIONS[0]
  );
  const [customInput, setCustomInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const grouped = getGroupedActions();

  // ── Dispatch Handlers ──────────────────────────────────────────────────

  const dispatchToJules = useCallback(
    async (prompt: string, taskTitle: string) => {
      setIsRunning(true);
      const loader = handleGlobalLoading(`Dispatching ${taskTitle}...`);
      try {
        const res = await fetch(
          `/api/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/jules/dispatch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              projectName,
              repoFullName: `${repoOwner}/${repoName}`,
            }),
          }
        );
        const data = (await res.json()) as any;
        if (!res.ok || !data.success)
          throw new Error(data.error || "Failed to dispatch task");
        loader.dismiss();
        handleGlobalSuccess(
          `${taskTitle} Dispatched`,
          <span>
            Session tracking ID:{" "}
            <a href={`https://jules.google.com/session/${data.sessionId}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-500">
              {data.sessionId}
            </a>
          </span>
        );
      } catch (e: any) {
        loader.dismiss();
        handleGlobalError(
          new Error(`Failed to dispatch ${taskTitle}: ${e.message}`)
        );
      } finally {
        setIsRunning(false);
      }
    },
    [repoOwner, repoName, projectName]
  );

  const handleSyncSecrets = useCallback(
    async (force = true) => {
      const owner = repositoryData?.owner || repoOwner;
      const repo = repositoryData?.name || repoName;
      if (!owner || !repo) {
        handleGlobalError("Repository information missing.");
        return;
      }
      setIsRunning(true);
      const loader = handleGlobalLoading("Syncing secrets to GitHub...");
      try {
        const res = await fetch("/api/ops/secrets/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner, repo, force }),
        });
        const data = (await res.json()) as {
          success: boolean;
          results?: any[];
          error?: string;
        };
        if (!res.ok || !data.success)
          throw new Error(data.error || "Failed to sync secrets");
        loader.dismiss();
        handleGlobalSuccess(
          'Secrets Synced',
          `Updated ${data.results?.length || 0} secrets in ${owner}/${repo}`
        );
      } catch (e: any) {
        loader.dismiss();
        handleGlobalError(`Failed to Sync Secrets: ${e.message}`);
      } finally {
        setIsRunning(false);
      }
    },
    [repositoryData, repoOwner, repoName]
  );

  // ── Run Action ─────────────────────────────────────────────────────────

  const handleRunAction = useCallback(async () => {
    if (!selectedAction) return;

    switch (selectedAction.handler) {
      case "jules": {
        const prompt = selectedAction.requiresInput
          ? customInput.trim()
          : selectedAction.prompt || "";
        if (!prompt) {
          handleGlobalError("Please enter a prompt before running this action.");
          return;
        }
        await dispatchToJules(prompt, selectedAction.label);
        if (selectedAction.requiresInput) setCustomInput("");
        break;
      }
      case "sync-secrets":
        await handleSyncSecrets(true);
        break;
      default:
        handleGlobalInfo('Not Implemented', 'Custom action handler not implemented yet.');
    }
  }, [selectedAction, customInput, dispatchToJules, handleSyncSecrets]);

  // ── Category icon color map ────────────────────────────────────────────

  const CATEGORY_COLORS: Record<string, string> = {
    "Jules Commands": "text-purple-400",
    Design: "text-pink-400",
    Operations: "text-amber-400",
    Maintenance: "text-emerald-400",
    Observability: "text-cyan-400",
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[820px] lg:max-w-[960px]">
        <DialogTitle className="sr-only">Repo Actions</DialogTitle>
        <DialogDescription className="sr-only">
          Run automated actions on {repoOwner}/{repoName}
        </DialogDescription>

        <SidebarProvider className="items-start">
          {/* ── Sidebar (left) ──────────────────────────────────────── */}
          <Sidebar collapsible="none" className="hidden md:flex border-r">
            <SidebarContent>
              <div className="px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold">Repo Actions</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  {repoOwner}/{repoName}
                </p>
              </div>

              <ScrollArea className="flex-1">
                {Array.from(grouped.entries()).map(([category, actions]) => (
                  <SidebarGroup key={category}>
                    <SidebarGroupLabel className={CATEGORY_COLORS[category]}>
                      {category}
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {actions.map((action) => (
                          <SidebarMenuItem key={action.id}>
                            <SidebarMenuButton
                              isActive={selectedAction?.id === action.id}
                              onClick={() => {
                                setSelectedAction(action);
                                setCustomInput("");
                              }}
                              className="text-xs"
                            >
                              <action.icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{action.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                ))}
              </ScrollArea>
            </SidebarContent>
          </Sidebar>

          {/* ── Content Pane (right) ────────────────────────────────── */}
          <main className="flex h-[560px] flex-1 flex-col overflow-hidden">
            {/* Header with breadcrumb */}
            <header className="flex h-14 shrink-0 items-center border-b px-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                      }}
                    >
                      Repo Actions
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                      }}
                    >
                      {selectedAction?.category}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1.5">
                      {selectedAction && (
                        <selectedAction.icon className="h-3.5 w-3.5" />
                      )}
                      {selectedAction?.label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>

            {/* Content */}
            <ScrollArea className="flex-1 p-5">
              {selectedAction ? (
                <div className="space-y-6 max-w-2xl">
                  {/* Title & Badge */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/40">
                        <selectedAction.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold leading-tight">
                          {selectedAction.label}
                        </h2>
                        <Badge
                          variant="outline"
                          className={`text-[10px] mt-0.5 ${CATEGORY_COLORS[selectedAction.category] || ""}`}
                        >
                          {selectedAction.category}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedAction.description}
                    </p>
                  </div>

                  {/* Instructions */}
                  {selectedAction.instructions && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5" />
                        How it works
                      </h3>
                      <div className="rounded-lg border border-dashed p-4 bg-card">
                        <p className="text-sm leading-relaxed">
                          {selectedAction.instructions}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Custom Input */}
                  {selectedAction.requiresInput && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Your Prompt</h3>
                      <Textarea
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        placeholder={
                          selectedAction.inputPlaceholder ||
                          "Enter your prompt..."
                        }
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                  )}

                  {/* Run Button */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      onClick={handleRunAction}
                      disabled={
                        isRunning ||
                        (selectedAction.requiresInput &&
                          !customInput.trim())
                      }
                      className="min-w-[160px]"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Run Action
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {selectedAction.handler === "jules"
                        ? "Dispatches to Jules AI"
                        : selectedAction.handler === "sync-secrets"
                          ? "Runs immediately"
                          : "Custom handler"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <p>Select an action from the sidebar.</p>
                </div>
              )}
            </ScrollArea>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
