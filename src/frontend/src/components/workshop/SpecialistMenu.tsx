import { useEffect, useState } from "react";
import * as LucideIcons from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  icon: string;
}

export function SpecialistMenu({ onSelect }: { onSelect: (id: string) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.frontend.workshop.specialists.$get()
      .then(res => res.json())
      .then(data => {
        if (mounted) {
          setAgents(data);
          setLoading(false);
        }
      })
      .catch(console.error);
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <LucideIcons.Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto h-full overflow-y-auto">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 mb-2">Build Your Agentic Team</h1>
        <p className="text-zinc-400">Select a specialist to begin defining your project architecture.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map(agent => {
          const IconComponent = (LucideIcons as any)[agent.icon] || LucideIcons.Bot;
          
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={cn(
                "flex flex-col text-left p-6 rounded-xl border border-zinc-800 bg-zinc-900/40",
                "hover:bg-zinc-800/60 hover:border-zinc-700 transition-all duration-300 group"
              )}
            >
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition-colors">
                <IconComponent className="w-6 h-6 text-indigo-400" />
              </div>
              
              <h3 className="text-lg font-medium text-zinc-200 mb-1">{agent.name}</h3>
              <p className="text-sm text-zinc-400 mb-6 flex-1">{agent.description}</p>
              
              <div className="flex flex-wrap gap-2 mt-auto">
                {agent.capabilities.map(cap => (
                  <span key={cap} className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-zinc-800 text-zinc-300 rounded">
                    {cap}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
