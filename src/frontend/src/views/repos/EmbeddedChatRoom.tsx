import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { useAgentRuntime } from "@/views/control/global/useAgentRuntime";
import { Terminal, Lightbulb } from "lucide-react";

export function EmbeddedChatRoom({ sessionId }: { sessionId: string }) {
    // We use the same generic custom agent runtime used in Chat.tsx
    const runtime = useAgentRuntime("chat-room", sessionId);

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <div className="flex flex-col h-full bg-background relative">
                {/* Header built into the embedded view */}
                <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0 bg-muted/20">
                    <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-500/10 border border-blue-500/20">
                        <Terminal className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Chat Room</h3>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                            ID: {sessionId.split('-')[0]}
                        </p>
                    </div>
                </div>

                {/* Banner describing purpose */}
                <div className="bg-blue-500/10 p-3 mx-4 mt-4 rounded-lg border border-blue-500/20 flex gap-2">
                   <Lightbulb className="w-5 h-5 text-blue-400 shrink-0" />
                   <p className="text-xs text-blue-300">
                     Chat to plan features, collaborate with agents, and receive real-time status updates.
                   </p>
                </div>
                
                <div className="flex-1 relative overflow-hidden mt-2">
                    <Thread />
                </div>
            </div>
        </AssistantRuntimeProvider>
    );
}
