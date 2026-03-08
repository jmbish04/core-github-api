import { useState, useEffect } from "react";
import { Zap, CircleCheck, CircleDashed, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JulesTaskPanel() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Poll for Jules tasks...
  useEffect(() => {
    let mounted = true;
    const fetchTasks = async () => {
      try {
        setLoading(true);
        // GET /api/agents/jules -> fetch active sessions 
        // Or if we specifically implemented a /workshop/jules-queue endpoint
        const res = await fetch("/api/agents/jules");
        if (res.ok && mounted) {
          const data = (await res.json()) as { sessions?: any[] };
          // Filter to just recent ones or specific to workshop
          if (data.sessions) setTasks(data.sessions.slice(0, 5));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchTasks();
    const interval = setInterval(fetchTasks, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="w-[320px] bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0 hidden lg:flex">
      
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center gap-3 px-5 shrink-0 bg-zinc-900/50">
        <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
        </div>
        <h2 className="font-semibold text-sm tracking-tight text-zinc-100">Jules Task Queue</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {tasks.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 px-4">
            <Zap className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm">No active tasks delegated to Jules.</p>
            <p className="text-[11px] mt-1">Ask the architect to scaffold a complex project.</p>
          </div>
        )}

        {/* Example Mock Task - Scaffolding RAG Agent */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/20">
            <div className="h-full bg-amber-500 w-2/3 rounded-full relative overflow-hidden">
               <div className="absolute inset-0 bg-white/20 animate-[pulse_1s_ease-in-out_infinite]" />
            </div>
          </div>
          
          <div className="flex justify-between items-start mt-1">
            <h3 className="text-sm font-medium text-zinc-200">Scaffolding RAG Agent</h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Working...
            </span>
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <CircleCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="line-through opacity-70">Create WorkflowEntrypoint</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <CircleCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="line-through opacity-70">Add vectorize binding</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-200 font-medium">
              <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
              <span>Write embedding logic</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <CircleDashed className="w-3.5 h-3.5" />
              <span>Create Hono routes</span>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800">
            <Button variant="outline" size="sm" className="w-full h-7 text-[10px] bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300" disabled>
              PR Preview (Pending)
            </Button>
          </div>
        </div>

        {/* Example Completed Task */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-medium text-zinc-200">HealthDiagnostician setup</h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              PR Ready
            </span>
          </div>

          <p className="text-[11px] text-zinc-500">
            Completed scaffolding for the new agent, including D1 migrations and Wrangler bindings.
          </p>

          <div className="pt-2 border-t border-zinc-800 flex justify-end">
            <Button variant="default" size="sm" className="h-7 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 px-3">
              Review PR <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 shrink-0">
        <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
           Delegate New Task
        </Button>
      </div>

    </div>
  );
}
