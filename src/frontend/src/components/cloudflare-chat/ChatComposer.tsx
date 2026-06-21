import {
  ComposerPrimitive,
  useLocalRuntime,
  AssistantRuntimeProvider,
} from "@assistant-ui/react";
import { Mic as MicIcon, Square as SquareIcon, Square, Send } from "lucide-react";
import { CloudflareWhisperAdapter } from "@/lib/cloudflare-whisper-adapter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ChatComposer({
  onSend,
  isRunning,
  onCancel,
  disabled,
}: {
  onSend: (text: string) => void;
  isRunning: boolean;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const runtime = useLocalRuntime(
    {
      async *run({ messages }) {
        const latest = messages[messages.length - 1];
        if (!latest || latest.role !== "user") {
          return;
        }
        const text = latest.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("");
        if (text) {
          onSend(text);
        }
        // Instantly finish Generation from the local runtime's perspective
        // to re-enable the composer input. Real 'isRunning' handled manually.
        yield { content: [{ type: "text", text: "" }] };
      },
    },
    {
      adapters: {
        dictation: new CloudflareWhisperAdapter(),
      },
    }
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className={cn(
          "relative flex w-full items-end gap-2 p-2 rounded-xl border border-border/60 bg-card/80 backdrop-blur shadow-sm transition-colors",
          disabled
            ? "opacity-50 pointer-events-none"
            : "focus-within:border-orange-500/40"
        )}
      >
        <ComposerPrimitive.Root className="flex-1 flex w-full items-center gap-2">
          <ComposerPrimitive.Input
            className="flex-1 min-h-[44px] max-h-40 resize-none border-0 bg-transparent shadow-none outline-none focus-visible:ring-0 text-sm leading-relaxed p-2 placeholder:text-muted-foreground/50"
            placeholder={
              disabled
                ? "Select or create a thread to start…"
                : "Ask about Cloudflare Workers, D1, R2, Agents…"
            }
            disabled={disabled || isRunning}
          />

          <ComposerPrimitive.If dictation={false}>
            <ComposerPrimitive.Dictate
              className="p-2 hover:bg-muted rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={disabled || isRunning}
              aria-label="Start dictation"
              title="Start dictation"
            >
              <MicIcon size={20} className="w-4 h-4" />
            </ComposerPrimitive.Dictate>
          </ComposerPrimitive.If>

          <ComposerPrimitive.If dictation>
            <ComposerPrimitive.StopDictation
              className="p-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Stop dictation"
              title="Stop dictation"
            >
              <SquareIcon size={20} className="w-4 h-4 animate-pulse" />
            </ComposerPrimitive.StopDictation>
          </ComposerPrimitive.If>

          {isRunning ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-red-400 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={onCancel}
              aria-label="Stop generation"
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <ComposerPrimitive.Send 
              className={cn(
                "flex items-center justify-center h-8 w-8 shrink-0 rounded-md transition-colors",
                "bg-orange-500 hover:bg-orange-600 text-white cursor-pointer data-[disabled]:opacity-30 data-[disabled]:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              aria-label="Send message"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </ComposerPrimitive.Send>
          )}
        </ComposerPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}
