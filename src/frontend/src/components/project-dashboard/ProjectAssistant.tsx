import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useParams } from "react-router-dom";

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type ProjectAssistantProps = {
  projectId: string;
  projectName: string;
  title?: string;
  description?: string;
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
  className?: string;
  suggestions?: string[];
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
    sessionId?: string;
  } | null;
  stitch?: {
    dispatched: boolean;
    message: string;
    sessionId?: string;
  } | null;
  error?: string;
};

export function ProjectAssistant({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  projectId,
  projectName,
  initialPrompt,
  onInitialPromptConsumed,
  title = "Project Assistant",
  description,
  className,
  suggestions = ["PRD", "Planning", "Jules Tasks", "Repo Analysis"],
}: ProjectAssistantProps) {
  const params = useParams();
  const repoOwner = params.owner || params.username || "";
  const repoName = params.repo || params.repo_name || "";
  
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
      {
        id: crypto.randomUUID(),
        role,
        content,
      },
    ]);
  };

  const runPrompt = async (prompt: string) => {
    const clean = prompt.trim();
    if (!clean || !repoOwner || !repoName) {
         if (!repoOwner || !repoName) appendMessage("assistant", "Error: Project repository context is missing. Cannot send request.");
         return;
    }

    appendMessage("user", clean);
    setIsRunning(true);

    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/assistant`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ prompt: clean }),
      });

      // Handle non-JSON responses gracefully
      const text = await response.text();
      let data: AssistantResponse;
      try {
        data = JSON.parse(text);
      } catch (e) {
         throw new Error(`Server returned non-JSON response: ${text}`, { cause: e });
      }

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
            ? `Jules dispatch: ${data.jules.message}${data.jules.sessionId ? `\nSession ID: ${data.jules.sessionId}` : ''}`
            : `Jules not dispatched: ${data.jules.message}`,
        );
      }
      if (data.stitch) {
        details.push(
          data.stitch.dispatched
            ? `Stitch dispatch: ${data.stitch.message}${data.stitch.sessionId ? `\nSession ID: ${data.stitch.sessionId}` : ''}`
            : `Stitch not dispatched: ${data.stitch.message}`,
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

  const handleSuggestionClick = (suggestion: string) => {
      // If it's a short label, we might want to map it to a longer prompt?
      // For now, just setting it as input. The user can edit or send.
      // But user said "clickable", implying immediate action or filling input.
      // Let's populate input for editing.
      setInput((prev) => (prev ? `${prev} ${suggestion}` : suggestion));
  };
  
  // Also support running immediately if it's a full prompt?
  // The badges in AssistantModal were "PRD", "Planning" etc. These are topics.
  // The user probably wants them to ACT as prompts or template starters.

  return (
    <Card className={cn("flex flex-col h-full min-h-[500px]", className)}>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex-1 rounded-md border min-h-0 overflow-hidden">
                <ScrollArea className="h-full px-3 py-3">
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
           
           <div className="space-y-2 shrink-0">
             <div className="flex flex-wrap gap-2">
               {suggestions.map((s) => (
                  <Badge 
                    key={s} 
                    variant="outline" 
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => handleSuggestionClick(s)}
                  >
                    {s}
                  </Badge>
               ))}
             </div>
             <Textarea
               rows={3}
               value={input}
               onChange={(event) => setInput(event.target.value)}
               placeholder={placeholder}
               onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       void handleSend();
                   }
               }}
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
  );
}
