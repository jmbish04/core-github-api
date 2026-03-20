import { useState, useRef, useEffect } from "react";
import { AgentSidebar } from "@/components/workshop/AgentSidebar";
import { JulesTaskPanel } from "@/components/workshop/JulesTaskPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Bot, User, Zap, Circle } from "lucide-react";
import { CFDocsBlockRenderer } from "@/components/cloudflare-chat/CFDocsBlockRenderer";

const REPOS = [
  { label: 'core-github-api', value: 'jmbish04/core-github-api' },
  { label: 'core-repo-templates', value: 'jmbish04/core-repo-templates' },
  { label: 'workers-chat-demo', value: 'jmbish04/workers-chat-demo' },
  { label: 'No repo context', value: '' },
];

export default function AgentWorkshop() {
  const [activeAgent, setActiveAgent] = useState("CfWorkshop_AgentsSdk");
  const [selectedRepoUrl, setSelectedRepoUrl] = useState("jmbish04/core-github-api");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim() || isLoading) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Build history excluding the last message
      const history = messages.map(m => ({ role: m.role, content: m.content || m.response }));

      const res = await fetch("/api/agents/workshop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          history,
          context: { repoFullName: selectedRepoUrl },
          model: selectedModel,
        }),
      });

      if (!res.ok) throw new Error("Failed to chat");
      
      const data = await res.json();
      setMessages(prev => [...prev, { ...(data as Record<string, any>), role: "assistant" }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev, 
        { role: "assistant", response: "Sorry, I encountered an error. Please try again." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-zinc-950 overflow-hidden text-zinc-100">
      
      {/* ── Left Sidebar ── */}
      <AgentSidebar activeAgent={activeAgent} onSelectAgent={setActiveAgent} />

      {/* ── Main Chat Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/50">
        
        {/* Top bar */}
        <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-5 bg-zinc-950/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-200">{activeAgent}</h2>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">Online</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedRepoUrl} onValueChange={setSelectedRepoUrl}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-300">
                <SelectValue placeholder="Repo context" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {REPOS.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs text-zinc-300">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[160px] h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-300">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="gemini-2.5-flash" className="text-xs text-zinc-300">Gemini 2.5 Flash</SelectItem>
                <SelectItem value="gemini-2.5-pro" className="text-xs text-zinc-300">Gemini 2.5 Pro</SelectItem>
                <SelectItem value="@cf/meta/llama-3.1-8b-instruct" className="text-xs text-zinc-300">Llama 3.1 8B (Fast)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Messages Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Bot className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-sm">Initiate a session with {activeAgent}</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                
                {msg.role !== "user" && (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-indigo-400" />
                  </div>
                )}
                
                <div className={`max-w-[80%] flex flex-col gap-3 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`px-5 py-3.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user" 
                      ? "bg-indigo-600/90 text-indigo-50 rounded-2xl rounded-tr-sm" 
                      : "bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-2xl rounded-tl-sm w-full"
                  }`}>
                    
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <div className="w-full">
                        {msg.blocks && msg.blocks.length > 0 ? (
                          <CFDocsBlockRenderer blocks={msg.blocks} modelUsed={msg.modelUsed || "gemini"} />
                        ) : (
                          msg.response || msg.content
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Followups */}
                  {msg.role !== "user" && msg.followupPrompts && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {msg.followupPrompts.map((prompt: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => handleSend(prompt)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 text-[11px] text-zinc-400 transition-colors disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-4 items-center pl-12 text-zinc-500">
              <Zap className="w-4 h-4 animate-pulse text-indigo-400" />
              <span className="text-xs font-medium tracking-wide animate-pulse">{activeAgent} is thinking...</span>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-6 pb-6 pt-2 shrink-0">
          <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden focus-within:border-indigo-500/50 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the architect..."
              className="flex-1 min-h-[52px] max-h-32 bg-transparent text-sm px-4 py-3.5 outline-none resize-none placeholder:text-zinc-600 text-zinc-200"
              rows={1}
            />
            <Button 
              onClick={() => handleSend()} 
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 h-8 w-8 p-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-opacity disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

      </div>

      {/* ── Right Jules Panel ── */}
      <JulesTaskPanel />
      
    </div>
  );
}
