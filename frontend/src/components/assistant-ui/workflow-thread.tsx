import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type WorkflowMutation = {
  title: string;
  subtitle: string;
  color?: "blue" | "green" | "purple" | "red" | "yellow";
};

type ThreadMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type JulesPayload = {
  optimizedPrompt: string;
  transcript: ThreadMessage[];
};

type WorkflowThreadProps = {
  workflowKey: string;
  workflowTitle: string;
  mode: "new" | "edit";
  onApplyMutation: (mutation: WorkflowMutation) => void;
  onSendToJules: (payload: JulesPayload) => Promise<{ ok: boolean; message: string }>;
};

function toStepTitle(input: string, fallbackIndex: number): string {
  const compact = input
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!].*$/, "");

  if (!compact) return `Step ${fallbackIndex}`;
  return compact.length > 42 ? `${compact.slice(0, 42).trim()}...` : compact;
}

function buildAssistantReply(input: string, mode: "new" | "edit", title: string): string {
  if (mode === "new") {
    return [
      `Draft updated for "${title}".`,
      "I mapped this as a new execution step and linked it into the flow.",
      "Keep iterating and I will continue refining the workflow graph.",
    ].join(" ");
  }

  return [
    `Change drafted for "${title}".`,
    "I updated the existing workflow graph with this modification path.",
    "Add more detail (triggers, guardrails, rollback rules) and I will keep applying changes.",
  ].join(" ");
}

export function WorkflowThread({
  workflowKey,
  workflowTitle,
  mode,
  onApplyMutation,
  onSendToJules,
}: WorkflowThreadProps) {
  const [input, setInput] = useState("");
  const [isSendingToJules, setIsSendingToJules] = useState(false);
  const [julesResult, setJulesResult] = useState<string>("");

  const [messages, setMessages] = useState<ThreadMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        mode === "new"
          ? "Describe your new workflow. I will update the canvas after each message."
          : `Describe the changes you want for "${workflowTitle}". I will update the canvas iteratively.`,
    },
  ]);

  const userMessageCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const stepTitle = toStepTitle(text, userMessageCount + 1);
    const userMessage: ThreadMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantMessage: ThreadMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: buildAssistantReply(text, mode, stepTitle),
    };

    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setInput("");

    onApplyMutation({
      title: stepTitle,
      subtitle:
        mode === "new"
          ? "Generated from workflow draft conversation"
          : "Generated from workflow modification conversation",
      color: mode === "new" ? "green" : "purple",
    });
  };

  const handleSendToJules = async () => {
    setIsSendingToJules(true);
    setJulesResult("");

    try {
      const conversation = messages
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join("\n");

      const optimizedPrompt = [
        `Repository: env.GITHUB_OWNER/core-github-api`,
        `Workflow Key: ${workflowKey}`,
        `Workflow Title: ${workflowTitle}`,
        `Mode: ${mode}`,
        "",
        "Conversation transcript:",
        conversation,
      ].join("\n");

      const result = await onSendToJules({
        optimizedPrompt,
        transcript: messages,
      });
      setJulesResult(result.message);
    } catch (error: any) {
      setJulesResult(error?.message || "Failed to send workflow task to Jules.");
    } finally {
      setIsSendingToJules(false);
    }
  };

  return (
    <div className="h-full border-l bg-card/40">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Workflow Assistant</p>
            <p className="text-xs text-muted-foreground">
              Iterative edits + Jules handoff for `env.GITHUB_OWNER/core-github-api`
            </p>
          </div>
          <Badge variant="outline">{mode === "new" ? "New" : "Edit"}</Badge>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  message.role === "assistant"
                    ? "border-border bg-muted/50"
                    : "ml-6 border-primary/40 bg-primary/10",
                )}
              >
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {message.role}
                </p>
                <p className="leading-relaxed">{message.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="space-y-2 border-t px-4 py-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe trigger, automation steps, and constraints..."
            rows={4}
          />
          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={handleSend}>
              Apply Change
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleSendToJules}
              disabled={isSendingToJules}
            >
              {isSendingToJules ? "Sending..." : "Send to Jules"}
            </Button>
          </div>
          {julesResult ? (
            <p className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
              {julesResult}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

