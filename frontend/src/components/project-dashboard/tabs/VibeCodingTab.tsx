import { useMemo, useState } from "react";
import { Bot, Loader2, Send, Sparkles, User, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VibeCodingTabProps = {
  projectId: string;
  projectName: string;
  repoOwner: string;
  repoName: string;
};

type VibeChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type VibeChatResponse = {
  success: boolean;
  reply?: string;
  implementationSteps?: string[];
  suggestedFiles?: string[];
  taskForJules?: string;
  jules?: {
    dispatched: boolean;
    message: string;
  } | null;
  error?: string;
};

const DEFAULT_PROMPTS = [
  "Design the full Golden Path scaffold for this repository.",
  "Create an implementation plan for a V2 control center UX refresh.",
  "Generate a refactor checklist for Hono + OpenAPI + Drizzle consistency.",
];

export function VibeCodingTab({
  projectId,
  projectName,
  repoOwner,
  repoName,
}: VibeCodingTabProps) {
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<VibeChatMessage[]>([
    {
      id: "vibe-intro",
      role: "assistant",
      content:
        "I am CodeGeneratorAgent. I can produce Golden Path implementation plans, suggested file changes, and Jules handoff tasks.",
    },
  ]);

  const placeholder = useMemo(
    () =>
      `Describe what to build for ${projectName} (${repoOwner}/${repoName})...`,
    [projectName, repoOwner, repoName],
  );

  const append = (role: "assistant" | "user", content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        content,
      },
    ]);
  };

  const runPrompt = async (prompt: string) => {
    const clean = prompt.trim();
    if (!clean || isRunning) return;
    append("user", clean);
    setIsRunning(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/vibe-coding/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ prompt: clean }),
      });
      const data = (await response.json()) as VibeChatResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      const detailBlocks: string[] = [];
      if (data.implementationSteps?.length) {
        detailBlocks.push(
          `Implementation Steps:\n${data.implementationSteps
            .map((step, index) => `${index + 1}. ${step}`)
            .join("\n")}`,
        );
      }
      if (data.suggestedFiles?.length) {
        detailBlocks.push(`Suggested Files:\n${data.suggestedFiles.map((file) => `- ${file}`).join("\n")}`);
      }
      if (data.taskForJules) {
        detailBlocks.push(`Jules Task:\n${data.taskForJules}`);
      }
      if (data.jules) {
        detailBlocks.push(
          data.jules.dispatched
            ? `Jules Dispatch: ${data.jules.message}`
            : `Jules Dispatch Skipped: ${data.jules.message}`,
        );
      }

      append("assistant", [data.reply || "Done.", ...detailBlocks].join("\n\n").trim());
    } catch (error: any) {
      append(
        "assistant",
        `Unable to complete CodeGeneratorAgent request: ${error?.message || "Unknown error."}`,
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleSend = async () => {
    const clean = input.trim();
    if (!clean || isRunning) return;
    setInput("");
    await runPrompt(clean);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            VibeSDK Coding Studio
          </CardTitle>
          <CardDescription>
            Connected to backend <code>CodeGeneratorAgent</code> with Golden Path enforcement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {DEFAULT_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                onClick={() => void runPrompt(prompt)}
                disabled={isRunning}
              >
                <Wand2 className="mr-2 h-3.5 w-3.5" />
                {prompt}
              </Button>
            ))}
          </div>

          <div className="rounded-md border">
            <ScrollArea className="h-[320px] p-3">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm",
                      message.role === "assistant"
                        ? "border-border bg-muted/40"
                        : "ml-8 border-primary/40 bg-primary/10",
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
              <Badge variant="outline">Golden Path</Badge>
              <Badge variant="outline">Scaffolding</Badge>
              <Badge variant="outline">Jules Handoff</Badge>
            </div>
            <Textarea
              rows={4}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={placeholder}
            />
            <div className="flex justify-end">
              <Button onClick={() => void handleSend()} disabled={isRunning}>
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
        </CardContent>
      </Card>
    </div>
  );
}

