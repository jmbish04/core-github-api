import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, MessageSquare, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

/**
 * AssistantModal supports two resolution modes:
 *
 * 1. **Project planning mode** — pass `projectId` directly (epics, user stories, backlog).
 *    The assistant endpoint is `/api/projects/:projectId/assistant`.
 *
 * 2. **Repo-scoped mode** — pass `repoOwner` + `repoName`. The modal resolves the
 *    associated D1 project ID at first call via `/api/repos/by-repo/:owner/:repo`,
 *    then routes to the same assistant endpoint.
 *
 * Both modes produce the same UI; the distinction is only in how the project ID is obtained.
 */
type AssistantModalProps = {
  /** Direct project planning ID (from D1 `repositories.id`). */
  projectId?: string;
  /** Repo owner (used for owner/repo resolution when projectId is not available). */
  repoOwner?: string;
  /** Repo name (used for owner/repo resolution when projectId is not available). */
  repoName?: string;
  /** Display name for the project / repository. */
  projectName: string;
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
};

type AssistantResponse = {
  success: boolean;
  reply?: string;
  prd?: string;
  planSaved?: {
    epicsCreated: number;
    userStoriesCreated: number;
    tasksCreated: number;
  } | null;
  jules?: {
    dispatched: boolean;
    message: string;
  } | null;
  error?: string;
};

export function AssistantModal({
  projectId: directProjectId,
  repoOwner,
  repoName,
  projectName,
  initialPrompt,
  onInitialPromptConsumed,
}: AssistantModalProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);


  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "I can help with PRDs, architecture plans, repo questions, and delegating implementation tasks to Jules.",
    },
  ]);

  const placeholder = useMemo(
    () =>
      `Ask about ${projectName}: create PRD, outline epic > stories > tasks, assign Jules, analyze build logs...`,
    [projectName],
  );

  const appendMessage = (role: "assistant" | "user", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content },
    ]);
  };



  const runPrompt = async (prompt: string) => {
    const clean = prompt.trim();
    if (!clean) return;

    appendMessage("user", clean);
    setIsRunning(true);

    try {
      if (!repoOwner || !repoName) {
        appendMessage("assistant", "⚠️ Could not resolve project context (missing owner/repo).");
        return;
      }

      const response = await fetch(`/api/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: clean }),
      });
      const data = ((await response.json()) as any) as AssistantResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      const details: string[] = [];
      if (data.planSaved) {
        details.push(
          `Saved plan structure: ${data.planSaved.epicsCreated} epics, ${data.planSaved.userStoriesCreated} user stories, ${data.planSaved.tasksCreated} tasks.`,
        );
      }
      if (data.jules) {
        details.push(
          data.jules.dispatched
            ? `Jules dispatch: ${data.jules.message}`
            : `Jules not dispatched: ${data.jules.message}`,
        );
      }
      if (data.prd) {
        details.push(`PRD generated:\n${data.prd}`);
      }

      const content = [data.reply || "Done.", ...details].join("\n\n").trim();
      appendMessage("assistant", content);
    } catch (error: any) {
      appendMessage(
        "assistant",
        `I could not complete that request: ${error?.message || "Unknown error."}`,
      );
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!initialPrompt) return;
    if (isRunning) return;

    setOpen(true);
    void runPrompt(initialPrompt);
    onInitialPromptConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const handleSend = async () => {
    const clean = input.trim();
    if (!clean || isRunning) return;
    setInput("");
    await runPrompt(clean);
  };

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-30 h-12 rounded-full px-4 shadow-lg"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Assistant
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Project Assistant
            </DialogTitle>
            <DialogDescription>
              Agent actions for <strong>{projectName}</strong>
              {repoOwner && repoName && !directProjectId && (
                <span className="ml-1 text-muted-foreground">
                  ({repoOwner}/{repoName})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border">
            <ScrollArea className="h-[320px] px-3 py-3">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm",
                      message.role === "assistant"
                        ? "border-border bg-muted/40"
                        : "ml-8 border-primary/30 bg-primary/10",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {message.role === "assistant" ? (
                        <Bot className="h-3 w-3" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                      {message.role}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">PRD</Badge>
              <Badge variant="outline">Planning</Badge>
              <Badge variant="outline">Jules Tasks</Badge>
              <Badge variant="outline">Repo Analysis</Badge>
            </div>
            <Textarea
              rows={4}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={placeholder}
            />
            <div className="flex justify-end">
              <Button onClick={handleSend} disabled={isRunning}>
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
