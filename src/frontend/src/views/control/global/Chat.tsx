import { useState, useEffect } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { useHoniChatRuntime } from "./useHoniChatRuntime";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Bot, Cpu } from "lucide-react";

import { WeatherToolUI } from "@/components/assistant-ui/tools/weather";

export default function ChatPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>("Orchestrator");

  // Fetch Agents
  useEffect(() => {
    fetch("/api/agents/specialists")
      .then(r => r.json() as any)
      .then(data => {
        if (data.agents && data.agents.length > 0) {
          setAgents(data.agents);
          setActiveAgentId(data.agents[0].id);
        }
      })
      .catch(err => console.error("Failed to fetch specialists", err));
  }, []);

  // Use our custom Honi websocket runtime.
  // Note: For a fully persistent thread list, a custom ThreadStore adapter would be needed. 
  // By default, assistant-ui's LocalRuntime manages threads in memory.
  const runtime = useHoniChatRuntime(activeAgentId, crypto.randomUUID());

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <WeatherToolUI />
      <SidebarProvider>
        <div className="flex h-[calc(100vh-6rem)] w-full bg-background border rounded-xl overflow-hidden shadow-sm">
          {/* Note: The ThreadListSidebar requires some tuning to match the dark theme perfectly 
              but provides the standard assistant-ui thread list experience. */}
          <ThreadListSidebar />
          
          <SidebarInset className="relative flex-1 flex flex-col min-w-0 bg-background">
            {/* Header / Agent Selector */}
            <header className="px-4 py-2 border-b flex items-center gap-3 bg-background/30 backdrop-blur shrink-0 justify-between">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-blue-400" /> Workspace Chat
                </span>
              </div>
              
              <div className="flex items-center bg-muted/30 border rounded-lg px-2 py-1.5 h-8">
                <Cpu className="w-3.5 h-3.5 text-muted-foreground mr-1.5 shrink-0" />
                <select
                  value={activeAgentId}
                  onChange={(e) => setActiveAgentId(e.target.value)}
                  className="bg-transparent border-none outline-none text-[11px] font-semibold cursor-pointer focus:ring-0 text-foreground"
                >
                  {agents.map(a => (
                    <option key={a.id} value={a.id} className="bg-background text-foreground">
                      {a.name} ({a.subtitle})
                    </option>
                  ))}
                  {agents.length === 0 && <option value="Orchestrator">Orchestrator</option>}
                </select>
              </div>
            </header>

            {/* Chat Thread */}
            <div className="flex-1 relative overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}
